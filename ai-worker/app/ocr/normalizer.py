"""
Indian License Plate Normalization and Format Validation (Phase 3D)
Source of Truth: backend/src/modules/vehicles/utils/plate-normalizer.ts & master_architecture.md
Deterministic cleaning: converts raw OCR reads to canonical uppercase alphanumeric representations.
Format validation is a diagnostic signal; it does NOT mutate or fabricate plate text.
"""

import re
from typing import Tuple

# Standard Indian State / RTO registration pattern:
# 2-letter state code + 1-2 digit RTO code + optional 0-3 letter series + 4-digit number
# Examples: GJ01AB1234, GJ1A1234, DL1CA1234, MH12CD5678
STANDARD_INDIAN_PLATE_PATTERN = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$")

# Bharat (BH) series registration pattern:
# 2-digit year of registration + BH + 4-digit number + 1-2 letter series
# Example: 22BH1234AA
BHARAT_SERIES_PLATE_PATTERN = re.compile(r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$")


def normalize_license_plate(input_str: str) -> str:
    """
    Deterministically standardize raw OCR text to canonical uppercase alphanumeric string.
    Strips whitespace, hyphens, dots, slashes, underscores, and special characters.
    Also strips leading HSRP country prefix 'IND' when followed by a valid Indian plate series.

    Examples:
        'gj 01-ab 1234'    -> 'GJ01AB1234'
        'GJ-01/AB-1234'    -> 'GJ01AB1234'
        'ind GJ01AB1234'   -> 'GJ01AB1234'
        '  mh.12.cd 5678 ' -> 'MH12CD5678'
        ''                 -> ''
    """
    if not input_str or not isinstance(input_str, str):
        return ""

    # Uppercase and strip all non-alphanumeric characters
    cleaned = re.sub(r"[^a-zA-Z0-9]", "", input_str.strip()).upper()

    # Deterministic HSRP prefix stripping: remove leading 'IND' if followed by valid registration pattern
    if cleaned.startswith("IND") and len(cleaned) >= 7:
        remainder = cleaned[3:]
        if STANDARD_INDIAN_PLATE_PATTERN.match(remainder) or BHARAT_SERIES_PLATE_PATTERN.match(remainder):
            return remainder

    return cleaned


def is_valid_indian_plate_format(plate: str) -> bool:
    """
    Validate whether a normalized plate string matches known Indian vehicle registration patterns.
    Diagnostic check only; does not reject non-matching plates or mutate characters.
    """
    if not plate or len(plate) < 4 or len(plate) > 15:
        return False

    if STANDARD_INDIAN_PLATE_PATTERN.match(plate):
        return True

    if BHARAT_SERIES_PLATE_PATTERN.match(plate):
        return True

    return False


def process_plate_text(raw_text: str) -> Tuple[str, bool]:
    """
    Convenience helper returning normalized text and format validity boolean.
    """
    normalized = normalize_license_plate(raw_text)
    format_valid = is_valid_indian_plate_format(normalized)
    return normalized, format_valid
