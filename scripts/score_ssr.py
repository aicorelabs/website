#!/usr/bin/env python3
"""Map natural-language persona statements to SSR-style 1-5 distributions."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Any
from urllib import request


EMBEDDING_MODEL = "text-embedding-3-small"

AFFINITY_ANCHORS = [
    [
        "I feel no professional connection to this person and would avoid engaging with them.",
        "I feel little alignment with this person and would probably not engage.",
        "I see some possible alignment, but I remain uncertain about engaging.",
        "I feel meaningfully aligned with this person and would probably explore working with them.",
        "I strongly identify with this person's perspective and would actively seek to work with them.",
    ],
    [
        "This person feels completely unsuitable for my needs.",
        "This person appears weakly aligned with my needs.",
        "This person may be relevant, although the fit remains unclear.",
        "This person appears strongly aligned with my needs and worth contacting.",
        "This person feels exceptionally aligned with my needs and would be a priority contact.",
    ],
    [
        "Nothing about this person's perspective resonates with me.",
        "Very little about this person's perspective resonates with me.",
        "Parts of this person's perspective resonate, but I am undecided.",
        "This person's perspective resonates strongly with how I approach the problem.",
        "This person's perspective feels deeply aligned with how I understand the problem.",
    ],
]

CONTACT_ANCHORS = [
    [
        "I would not contact, shortlist, hire or recommend this person.",
        "I would be unlikely to contact or shortlist this person.",
        "I might contact this person, but only after more evidence.",
        "I would probably contact or shortlist this person.",
        "I would actively contact or recommend this person as a priority.",
    ],
    [
        "The website gives me no reason to take the next step.",
        "The website gives me weak reasons to take the next step.",
        "The website gives me some reasons to take the next step, but I remain uncertain.",
        "The website gives me clear reasons to take the next step.",
        "The website makes taking the next step feel urgent and well justified.",
    ],
    [
        "I would avoid engaging based on this website.",
        "I would probably keep looking for another supplier.",
        "I would keep this supplier in mind but not prioritize them.",
        "I would seriously consider starting a conversation.",
        "I would be ready to start a conversation now.",
    ],
]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if stripped:
                rows.append(json.loads(stripped))
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def embed_texts(texts: list[str], api_key: str) -> list[list[float]]:
    payload = json.dumps({"model": EMBEDDING_MODEL, "input": texts}).encode("utf-8")
    req = request.Request(
        "https://api.openai.com/v1/embeddings",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=60) as response:
        body = json.loads(response.read().decode("utf-8"))
    return [item["embedding"] for item in body["data"]]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


def distribution(statement_embedding: list[float], anchor_embeddings: list[list[float]]) -> list[float]:
    similarities = [cosine_similarity(statement_embedding, anchor) for anchor in anchor_embeddings]
    minimum = min(similarities)
    shifted = [score - minimum for score in similarities]
    total = sum(shifted)
    if total == 0:
        return [0.2, 0.2, 0.2, 0.2, 0.2]
    return [score / total for score in shifted]


def average_distributions(distributions: list[list[float]]) -> list[float]:
    return [
        sum(distribution[index] for distribution in distributions) / len(distributions)
        for index in range(5)
    ]


def score_statement(statement: str, anchor_sets: list[list[str]], api_key: str) -> dict[str, Any]:
    flat_anchors = [anchor for anchor_set in anchor_sets for anchor in anchor_set]
    embeddings = embed_texts([statement, *flat_anchors], api_key)
    statement_embedding = embeddings[0]
    anchor_embeddings = embeddings[1:]

    offset = 0
    all_distributions: list[list[float]] = []
    for anchor_set in anchor_sets:
        current = anchor_embeddings[offset : offset + len(anchor_set)]
        all_distributions.append(distribution(statement_embedding, current))
        offset += len(anchor_set)

    averaged = average_distributions(all_distributions)
    expected = sum(rating * probability for rating, probability in zip([1, 2, 3, 4, 5], averaged))
    modal = max(range(1, 6), key=lambda rating: averaged[rating - 1])

    return {
        "distribution": {str(index + 1): round(probability, 4) for index, probability in enumerate(averaged)},
        "expected": round(expected, 2),
        "modal": modal,
    }


def score_row(row: dict[str, Any], api_key: str) -> dict[str, Any]:
    affinity = score_statement(row["founder_affinity_statement"], AFFINITY_ANCHORS, api_key)
    contact = score_statement(row["contact_intent_statement"], CONTACT_ANCHORS, api_key)
    return {
        "persona_id": row["persona_id"],
        "affinity_distribution": affinity["distribution"],
        "expected_affinity": affinity["expected"],
        "modal_affinity": affinity["modal"],
        "contact_distribution": contact["distribution"],
        "expected_contact_intent": contact["expected"],
        "modal_contact_intent": contact["modal"],
        "positive_reasons": row.get("positive_reasons", []),
        "negative_reasons": row.get("negative_reasons", []),
        "missing_proof": row.get("missing_proof", []),
        "raw_review": row,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="reports/raw-persona-reviews.jsonl")
    parser.add_argument("--output", default="reports/scored-persona-reviews.jsonl")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is required.", file=sys.stderr)
        return 2

    rows = read_jsonl(Path(args.input))
    scored = [score_row(row, api_key) for row in rows]
    write_jsonl(Path(args.output), scored)
    print(f"Scored {len(scored)} persona reviews to {args.output}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
