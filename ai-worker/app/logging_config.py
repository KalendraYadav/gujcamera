"""
Structured Logging Configuration for AI Vision Worker
"""

import logging
import sys
from app.config import sanitize_url


class SanitizingFormatter(logging.Formatter):
    """Log formatter that automatically masks RTSP/HTTP credentials in log strings"""
    def format(self, record: logging.LogRecord) -> str:
        original = super().format(record)
        return sanitize_url(original)


def setup_logging(log_level: str = "INFO") -> logging.Logger:
    """Initialize structured console logger"""
    level = getattr(logging, log_level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Remove existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    formatter = SanitizingFormatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    logger = logging.getLogger("ai_worker")
    logger.info("Logging initialized at level: %s", log_level.upper())
    return logger
