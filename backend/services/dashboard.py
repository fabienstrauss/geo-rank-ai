from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from deps import get_workspace_or_404
from models import CompetitorSnapshot, Prompt, PromptMetricSnapshot, Run, ScrapeResult, SourceCitation, WorkspaceSetting
from schemas import DashboardRead


def build_dashboard_response(db: Session, workspace_id: UUID) -> DashboardRead:
    workspace = get_workspace_or_404(db, workspace_id)
    setting_rows = db.scalars(select(WorkspaceSetting).where(WorkspaceSetting.workspace_id == workspace_id)).all()
    settings_map = {item.key: item.value_json for item in setting_rows}
    prompts = db.scalars(select(Prompt).options(selectinload(Prompt.category)).where(Prompt.workspace_id == workspace_id)).all()
    snapshots = db.scalars(
        select(PromptMetricSnapshot)
        .where(PromptMetricSnapshot.workspace_id == workspace_id)
        .order_by(PromptMetricSnapshot.snapshot_at.asc())
    ).all()
    runs = db.scalars(select(Run).where(Run.workspace_id == workspace_id)).all()
    citations = db.scalars(
        select(SourceCitation)
        .join(ScrapeResult, SourceCitation.scrape_result_id == ScrapeResult.id)
        .join(Prompt, ScrapeResult.prompt_id == Prompt.id)
        .where(Prompt.workspace_id == workspace_id)
    ).all()
    competitor_snapshots = db.scalars(
        select(CompetitorSnapshot)
        .where(CompetitorSnapshot.workspace_id == workspace_id)
        .order_by(CompetitorSnapshot.snapshot_at.asc(), CompetitorSnapshot.brand.asc())
    ).all()

    category_names = {prompt.category_id: prompt.category.name for prompt in prompts if prompt.category}

    prompt_snapshots: dict[UUID, list[PromptMetricSnapshot]] = {}
    for snapshot in snapshots:
        if snapshot.prompt_id:
            prompt_snapshots.setdefault(snapshot.prompt_id, []).append(snapshot)

    label_map: dict[str, str] = {}
    for snapshot in snapshots:
        label_map[snapshot.snapshot_at.strftime("%Y-%m")] = snapshot.snapshot_at.strftime("%b")
    labels = list(label_map.values())[-6:] or ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    category_series: dict[str, list[list[float]]] = {}
    for prompt in prompts:
        rows = prompt_snapshots.get(prompt.id, [])
        if not rows:
            continue

        category_label = category_names.get(prompt.category_id, prompt.target_brand)
        category_series.setdefault(category_label, []).append([round(item.visibility_score or 0, 1) for item in rows[-6:]])

    series = []
    for label, value_sets in list(category_series.items())[:4]:
        max_len = max(len(values) for values in value_sets)
        averaged_values = []
        for index in range(max_len):
            index_values = [values[index] for values in value_sets if index < len(values)]
            averaged_values.append(round(sum(index_values) / len(index_values), 1))

        series.append({"label": label, "values": averaged_values})

    if not series:
        series = [{"label": "GeoRank AI", "values": [0, 0, 0, 0, 0, 0]}]

    latest_by_prompt = {prompt_id: items[-1] for prompt_id, items in prompt_snapshots.items() if items}
    category_points: dict[str, list[tuple[float, float]]] = {}
    for prompt in prompts:
        latest_snapshot = latest_by_prompt.get(prompt.id)
        if not latest_snapshot:
            continue

        category_label = category_names.get(prompt.category_id, prompt.target_brand)
        category_points.setdefault(category_label, []).append(
            (
                round(latest_snapshot.visibility_score or 0, 1),
                round(latest_snapshot.sentiment_score or 0, 1),
            )
        )

    sentiment_points = []
    for label, points in list(category_points.items())[:4]:
        avg_visibility = round(sum(point[0] for point in points) / len(points), 1)
        avg_sentiment = round(sum(point[1] for point in points) / len(points), 1)
        sentiment_points.append({"label": label, "x": avg_visibility, "y": avg_sentiment})

    citation_totals: dict[str, int] = {}
    top_sources: dict[str, dict[str, int | str]] = {}
    for citation in citations:
        label = citation.source_type or "Unknown"
        citation_totals[label] = citation_totals.get(label, 0) + citation.citation_count
        url = citation.url or citation.domain
        if url not in top_sources:
            top_sources[url] = {"url": url, "source_type": label, "citations": 0}
        top_sources[url]["citations"] = int(top_sources[url]["citations"]) + citation.citation_count

    source_slices = [
        {"label": key, "value": value} for key, value in sorted(citation_totals.items(), key=lambda item: item[1], reverse=True)
    ]
    top_source_rows = sorted(top_sources.values(), key=lambda item: int(item["citations"]), reverse=True)[:4]

    sorted_prompt_snapshot_groups = [items for items in prompt_snapshots.values() if items]
    latest_prompt_snapshots = [items[-1] for items in sorted_prompt_snapshot_groups]
    previous_prompt_snapshots = [items[-2] for items in sorted_prompt_snapshot_groups if len(items) > 1]

    avg_visibility = round(
        sum((snapshot.visibility_score or 0) for snapshot in latest_prompt_snapshots) / max(len(latest_prompt_snapshots), 1), 1
    )
    previous_avg_visibility = round(
        sum((snapshot.visibility_score or 0) for snapshot in previous_prompt_snapshots) / max(len(previous_prompt_snapshots), 1), 1
    )
    avg_sentiment = round(
        sum((snapshot.sentiment_score or 0) for snapshot in latest_prompt_snapshots) / max(len(latest_prompt_snapshots), 1), 1
    )
    previous_avg_sentiment = round(
        sum((snapshot.sentiment_score or 0) for snapshot in previous_prompt_snapshots) / max(len(previous_prompt_snapshots), 1), 1
    )

    competitor_groups: dict[str, list[CompetitorSnapshot]] = {}
    for snapshot in competitor_snapshots:
        competitor_groups.setdefault(snapshot.brand, []).append(snapshot)

    competitors = []
    for brand, rows in competitor_groups.items():
        latest = rows[-1]
        competitors.append(
            {
                "brand": brand,
                "avg_rank": round(latest.avg_rank, 1),
                "share": int(round(latest.share_of_voice)),
            }
        )
    competitors.sort(key=lambda item: item["avg_rank"])

    target_brand = (settings_map.get("workspace_profile") or {}).get("tracked_brand") or (
        prompts[0].target_brand if prompts else workspace.name
    )
    your_brand_history = competitor_groups.get(target_brand, [])
    current_rank = round(your_brand_history[-1].avg_rank, 1) if your_brand_history else None
    previous_rank = round(your_brand_history[-2].avg_rank, 1) if len(your_brand_history) > 1 else None
    rank_delta = None
    if current_rank is not None and previous_rank is not None:
        improvement = round(previous_rank - current_rank, 1)
        rank_delta = f"{'+' if improvement >= 0 else ''}{improvement} from previous snapshot"

    visibility_delta = round(avg_visibility - previous_avg_visibility, 1) if previous_prompt_snapshots else None
    sentiment_delta = round(avg_sentiment - previous_avg_sentiment, 1) if previous_prompt_snapshots else None

    return DashboardRead(
        stats=[
            {"label": "Average Rank", "value": current_rank if current_rank is not None else "N/A", "delta": rank_delta},
            {"label": "Keywords Tracked", "value": len(prompts), "subtitle": f"Across {len(category_names)} prompt groups"},
            {
                "label": "Visibility Score",
                "value": f"{avg_visibility:.0f}%",
                "delta": (
                    f"{'+' if visibility_delta >= 0 else ''}{visibility_delta:.1f} pts from previous snapshot"
                    if visibility_delta is not None
                    else None
                ),
            },
            {
                "label": "Positive Sentiment",
                "value": f"{avg_sentiment:.0f}%",
                "delta": (
                    f"{'+' if sentiment_delta >= 0 else ''}{sentiment_delta:.1f} pts from previous snapshot"
                    if sentiment_delta is not None
                    else None
                ),
                "subtitle": None if sentiment_delta is not None else "No prior comparison window",
            },
        ],
        visibility_chart={"labels": labels[-6:], "series": series},
        sentiment_points=sentiment_points,
        source_slices=source_slices,
        competitors=competitors,
        top_sources=top_source_rows,
    )
