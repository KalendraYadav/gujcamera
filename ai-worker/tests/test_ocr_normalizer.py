"""
Unit Tests for Indian License Plate Normalization and Format Validation (Phase 3D)
"""

from app.ocr.normalizer import (
    is_valid_indian_plate_format,
    normalize_license_plate,
    process_plate_text,
)


def test_normalize_license_plate_standard_formatting():
    # Whitespace and hyphen removal
    assert normalize_license_plate("gj 01-ab 1234") == "GJ01AB1234"
    assert normalize_license_plate("GJ-01-AB-1234") == "GJ01AB1234"
    assert normalize_license_plate("  dl 1 ca 1234  ") == "DL1CA1234"
    assert normalize_license_plate("mh.12.cd.5678") == "MH12CD5678"
    assert normalize_license_plate("GJ/01/AB/1234") == "GJ01AB1234"
    assert normalize_license_plate("gj_01_ab_1234") == "GJ01AB1234"

    # Deterministic HSRP IND prefix stripping
    assert normalize_license_plate("ind GJ01AB1234") == "GJ01AB1234"
    assert normalize_license_plate("IND-GJ01AB1234") == "GJ01AB1234"

    # Zero silent character mutation: O, I, B, Z are NEVER mutated
    assert normalize_license_plate("GJO1AB1234") == "GJO1AB1234"
    assert normalize_license_plate("GJI1AB1234") == "GJI1AB1234"
    assert normalize_license_plate("GZB1AB1234") == "GZB1AB1234"


def test_normalize_license_plate_empty_and_special_cases():
    assert normalize_license_plate("") == ""
    assert normalize_license_plate("   ") == ""
    assert normalize_license_plate("---") == ""
    assert normalize_license_plate(None) == ""  # type: ignore


def test_is_valid_indian_plate_format():
    # Standard passenger formats
    assert is_valid_indian_plate_format("GJ01AB1234") is True
    assert is_valid_indian_plate_format("MH12CD5678") is True
    assert is_valid_indian_plate_format("KA05MJ9999") is True
    assert is_valid_indian_plate_format("DL1CA1234") is True
    assert is_valid_indian_plate_format("GJ1A1234") is True

    # Bharat Series (BH)
    assert is_valid_indian_plate_format("22BH1234AA") is True
    assert is_valid_indian_plate_format("21BH9999A") is True

    # Invalid formats
    assert is_valid_indian_plate_format("INVALID") is False
    assert is_valid_indian_plate_format("1234567890") is False
    assert is_valid_indian_plate_format("AB12") is False
    assert is_valid_indian_plate_format("GJ01AB1234567890") is False
    assert is_valid_indian_plate_format("") is False


def test_process_plate_text_convenience_helper():
    norm, valid = process_plate_text("gj-01 ab 1234")
    assert norm == "GJ01AB1234"
    assert valid is True

    norm2, valid2 = process_plate_text("unknown text")
    assert norm2 == "UNKNOWNTEXT"
    assert valid2 is False
