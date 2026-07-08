#!/usr/bin/env python3
"""Validate persona-review JSONL output before SSR scoring."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


REQUIRED_FIELDS = [
    "persona_id",
    "first_impression",
    "understanding_of_offer",
    "problem_resonance_statement",
    "trust_statement",
    "founder_affinity_statement",
    "contact_intent_statement",
    "positive_reasons",
    "negative_reasons",
    "specific_page_evidence",
    "missing_proof",
    "likely_next_action",
]

LIST_FIELDS = {
    "positive_reasons",
    "negative_reasons",
    "specific_page_evidence",
    "missing_proof",
}

RATING_PATTERNS = [
    re.compile(r"\b[1-5]\s*/\s*5\b"),
    re.compile(r"\brating\b", re.IGNORECASE),
    re.compile(r"\bscore\b", re.IGNORECASE),
    re.compile(r"\b[1-5]\s+out\s+of\s+5\b", re.IGNORECASE),
]


def iter_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                value = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"line {line_no}: invalid JSON: {exc}") from exc
            if not isinstance(value, dict):
                raise ValueError(f"line {line_no}: expected a JSON object")
            rows.append(value)
    return rows


def object_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(object_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(object_text(item) for item in value.values())
    return ""


def validate_row(row: dict[str, Any], index: int) -> list[str]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if field not in row:
            errors.append(f"row {index}: missing field {field}")

    for field in LIST_FIELDS:
        if field in row and not isinstance(row[field], list):
            errors.append(f"row {index}: {field} must be a list")

    if not row.get("specific_page_evidence"):
        errors.append(f"row {index}: specific_page_evidence must not be empty")

    text = object_text(row)
    for pattern in RATING_PATTERNS:
        if pattern.search(text):
            errors.append(f"row {index}: appears to contain a numerical rating or score")
            break

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "path",
        nargs="?",
        default="reports/raw-persona-reviews.jsonl",
        help="Path to raw persona review JSONL.",
    )
    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"Missing file: {path}", file=sys.stderr)
        return 2

    try:
        rows = iter_jsonl(path)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 1

    errors: list[str] = []
    for index, row in enumerate(rows, start=1):
        errors.extend(validate_row(row, index))

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Validated {len(rows)} persona reviews.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
