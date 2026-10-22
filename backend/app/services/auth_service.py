import logging
import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from fastapi import Depends, HTTPException, status, Header, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

from app.core.config import settings
from app.schemas.enums import UserRole, AccountStatus
from app.repositories.user_repo import user_repo

logger = logging.getLogger("college_bus.auth")

security = HTTPBearer(auto_error=False)

# Initialize Firebase Admin if credentials are provided
_firebase_initialized = False

def initialize_firebase():
    global _firebase_initialized
    if _firebase_initialized:
        return
    try:
        if settings.FIREBASE_CREDENTIALS_PATH and os.path.exists(settings.FIREBASE_CREDENTIALS_PATH):
            cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.info("Firebase Admin initialized with service account certificate.")
        elif settings.FIREBASE_PROJECT_ID:
            firebase_admin.initialize_app(options={'projectId': settings.FIREBASE_PROJECT_ID})
            _firebase_initialized = True
            logger.info(f"Firebase Admin initialized with project ID '{settings.FIREBASE_PROJECT_ID}'.")
        else:
            logger.warning("Firebase credentials not supplied. Using secure JWT dev tokens for authentication.")
    except Exception as e:
        logger.warning(f"Firebase Admin initialization warning: {e}. Dev tokens will be accepted.")

initialize_firebase()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

async def verify_token(token: str) -> Dict[str, Any]:
    """
    Verifies either a Firebase ID Token or an Application JWT.
    """
    # 1. First try Application JWT
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        pass

    # 2. Try Firebase ID Token if Firebase is initialized
    if _firebase_initialized:
        try:
            decoded_token = firebase_auth.verify_id_token(token)
            return {
                "sub": decoded_token.get("uid"),
                "email": decoded_token.get("email"),
                "name": decoded_token.get("name") or decoded_token.get("email", "").split("@")[0],
                "firebase": True
            }
        except Exception as e:
            logger.error(f"Firebase ID token verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Firebase ID token: {str(e)}"
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials or token expired."
    )

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Dict[str, Any]:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token required."
        )

    token = credentials.credentials
    token_data = await verify_token(token)
    
    # Locate user in MongoDB by firebase_uid or id or email
    user = None
    if "uid" in token_data:
        user = await user_repo.get_by_firebase_uid(token_data["uid"])
    elif "sub" in token_data:
        # Check if sub is firebase_uid or internal user id
        user = await user_repo.get_by_firebase_uid(token_data["sub"])
        if not user:
            user = await user_repo.get_by_id(token_data["sub"])
    elif "email" in token_data:
        user = await user_repo.get_by_email(token_data["email"])

    # Auto-provision or register user if new
    if not user and "email" in token_data:
        email = token_data.get("email", "")
        name = token_data.get("name") or email.split("@")[0]
        uid = token_data.get("sub") or token_data.get("uid") or f"user_{email}"
        role = token_data.get("role", UserRole.STUDENT.value)
        status_val = AccountStatus.ACTIVE.value if role != UserRole.DRIVER.value else AccountStatus.PENDING_REVIEW.value
        user = await user_repo.create_user(
            firebase_uid=uid,
            email=email,
            name=name,
            role=UserRole(role) if role in [r.value for r in UserRole] else UserRole.STUDENT,
            account_status=AccountStatus(status_val)
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found."
        )

    if user.get("account_status") == AccountStatus.SUSPENDED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended. Please contact the college transport manager."
        )

    return user

def require_roles(allowed_roles: List[UserRole]):
    def role_checker(current_user: Dict[str, Any] = Depends(get_current_user)):
        user_role = current_user.get("role")
        allowed_str = [r.value for r in allowed_roles]
        if user_role not in allowed_str:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required roles: {allowed_str}, your role: '{user_role}'"
            )
        return current_user
    return role_checker
