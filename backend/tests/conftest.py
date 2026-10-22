import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient
from httpx import AsyncClient, ASGITransport
from app.db.mongodb import mongo_manager
from app.main import app
from app.services.auth_service import create_access_token
from app.schemas.enums import UserRole, AccountStatus

@pytest_asyncio.fixture(autouse=True)
async def setup_test_db():
    # Replace live Mongo client with in-memory AsyncMongoMockClient for tests
    mock_client = AsyncMongoMockClient()
    mongo_manager.client = mock_client
    mongo_manager.db = mock_client["test_college_bus_tracking"]
    yield
    mock_client.close()
    mongo_manager.client = None
    mongo_manager.db = None

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

@pytest.fixture
def manager_token():
    return create_access_token({
        "sub": "mgr_123",
        "email": "manager@college.edu",
        "name": "Fleet Manager",
        "role": UserRole.BUS_MANAGER.value
    })

@pytest.fixture
def driver_token():
    return create_access_token({
        "sub": "drv_123",
        "email": "driver@college.edu",
        "name": "John Driver",
        "role": UserRole.DRIVER.value
    })

@pytest.fixture
def student_token():
    return create_access_token({
        "sub": "std_123",
        "email": "student@college.edu",
        "name": "Alice Student",
        "role": UserRole.STUDENT.value
    })

@pytest.fixture
def admin_token():
    return create_access_token({
        "sub": "admin_123",
        "email": "admin@college.edu",
        "name": "System Administrator",
        "role": UserRole.ADMIN.value
    })
