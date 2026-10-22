import os
import joblib
import logging
from typing import Optional, Dict, Any, Tuple
import numpy as np

logger = logging.getLogger("college_bus.ml")

MODEL_PATH = os.path.join(os.path.dirname(__file__), "trained_eta_model.joblib")

class ETAModelService:
    def __init__(self):
        self.model = None
        self.feature_columns = [
            "remaining_distance_meters",
            "hour_of_day",
            "day_of_week",
            "stops_remaining",
            "current_speed_kmh"
        ]
        self.load_model()

    def load_model(self):
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
                logger.info(f"Loaded trained ETA ML model from {MODEL_PATH}")
            except Exception as e:
                logger.warning(f"Could not load ML model: {e}")
                self.model = None
        else:
            self.model = None

    def predict_eta_seconds(
        self,
        remaining_distance_meters: float,
        hour_of_day: int,
        day_of_week: int,
        stops_remaining: int,
        current_speed_kmh: float
    ) -> Optional[float]:
        if self.model is None:
            return None
        try:
            features = np.array([[
                remaining_distance_meters,
                hour_of_day,
                day_of_week,
                stops_remaining,
                current_speed_kmh
            ]])
            pred = self.model.predict(features)
            return float(max(0.0, pred[0]))
        except Exception as e:
            logger.error(f"ML prediction error: {e}")
            return None

    def train_and_save(self, X: np.ndarray, y: np.ndarray) -> Dict[str, Any]:
        """
        Trains an XGBoost Regressor or Random Forest Regressor and evaluates MAE.
        """
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.metrics import mean_absolute_error, r2_score
        from sklearn.model_selection import train_test_split

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        regressor = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
        regressor.fit(X_train, y_train)

        y_pred = regressor.predict(X_test)
        mae = float(mean_absolute_error(y_test, y_pred))
        r2 = float(r2_score(y_test, y_pred))

        joblib.dump(regressor, MODEL_PATH)
        self.model = regressor
        logger.info(f"Trained and saved ETA model with MAE: {mae:.2f}s, R2: {r2:.3f}")
        return {
            "mae_seconds": mae,
            "r2_score": r2,
            "training_samples": len(X_train),
            "test_samples": len(X_test),
            "model_path": MODEL_PATH
        }

ml_eta_service = ETAModelService()
