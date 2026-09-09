"""
Plate Crop Preparation and Image Preprocessor for OCR (Phase 3D)
Prepares transient in-memory crops from full video frames using bounding boxes.
Applies deterministic contrast normalization and binarization suitable for CCTV plate crops.
Image crops exist purely in transient memory and are never persisted to disk or domain contracts.
"""

from typing import Optional, Tuple
import cv2
import numpy as np

from app.detection_contract import BoundingBox


def prepare_plate_crop(
    frame: np.ndarray,
    bbox: BoundingBox,
    min_width: int = 24,
    min_height: int = 8,
) -> Optional[np.ndarray]:
    """
    Extract safely bounded submatrix from decoded full video frame.

    Args:
        frame: Decoded full frame BGR image matrix
        bbox: BoundingBox of localized plate
        min_width: Minimum allowable width in pixels
        min_height: Minimum allowable height in pixels

    Returns:
        Cropped BGR numpy array, or None if invalid or out of bounds.
    """
    if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
        return None

    frame_h, frame_w = frame.shape[:2]
    if frame_w <= 0 or frame_h <= 0:
        return None

    clipped = bbox.clip(frame_w, frame_h)
    if clipped.width < min_width or clipped.height < min_height:
        return None

    crop = frame[clipped.y1:clipped.y2, clipped.x1:clipped.x2]
    if crop is None or crop.size == 0:
        return None

    return crop


def preprocess_plate_crop(
    crop: np.ndarray,
    target_height: int = 64,
    variant: str = "clahe_otsu",
) -> Tuple[np.ndarray, str]:
    """
    Apply deterministic preprocessing pipeline tailored for license plate OCR.

    Steps:
    1. Grayscale conversion.
    2. Resolution upscaling with bicubic interpolation if below target height.
    3. CLAHE contrast enhancement for uneven illumination.
    4. Gaussian/Bilateral smoothing for camera sensor noise.
    5. Otsu adaptive binarization.
    6. Polarity check (ensuring black text on white background for Tesseract).

    Args:
        crop: In-memory BGR crop of plate
        target_height: Desired height for stroke definition
        variant: Preprocessing variant name

    Returns:
        Tuple of (preprocessed single-channel image matrix, variant name applied).
    """
    if crop is None or crop.size == 0:
        return np.zeros((0, 0), dtype=np.uint8), "empty"

    h, w = crop.shape[:2]

    # 1. Grayscale
    if len(crop.shape) == 3 and crop.shape[2] == 3:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    else:
        gray = crop.copy()

    # 2. Rescale up if necessary for neural LSTM character recognition
    if h < target_height:
        scale = float(target_height) / float(h)
        new_w = int(w * scale)
        gray = cv2.resize(gray, (new_w, target_height), interpolation=cv2.INTER_CUBIC)

    # 3. Contrast Normalization via CLAHE
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    enhanced = clahe.apply(gray)

    # 4. Subtle Gaussian blur to reduce high-frequency sensor noise
    blurred = cv2.GaussianBlur(enhanced, (3, 3), 0)

    # 5. Otsu thresholding
    _, binarized = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # 6. Polarity normalization:
    # Tesseract performs best with dark text on a light background.
    # If the border/edges are predominantly dark, the plate is likely dark background.
    border_pixels = np.concatenate([
        binarized[0, :],
        binarized[-1, :],
        binarized[:, 0],
        binarized[:, -1],
    ])
    if np.mean(border_pixels) < 127:
        # Invert so background is light and characters are dark
        binarized = cv2.bitwise_not(binarized)

    # 7. Border rim clearing:
    # Outer license plate rims or mounting frames frequently trigger false 'I' or '1' OCR artifacts.
    # Clear outer border margin to pure background (white = 255) to eliminate edge noise.
    margin = 4
    if binarized.shape[0] > 20 and binarized.shape[1] > 20:
        binarized[:margin, :] = 255
        binarized[-margin:, :] = 255
        binarized[:, :margin] = 255
        binarized[:, -margin:] = 255

    return binarized, variant
