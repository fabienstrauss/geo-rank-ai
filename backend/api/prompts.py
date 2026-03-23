from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from deps import DbSession, get_workspace_or_404
from models import Prompt, PromptCategory
from schemas import CategoryCreate, CategoryUpdate, PromptCreate, PromptListRead, PromptRead, PromptUpdate, PromptCategoryRead
from services.read_models import build_prompt_list_response, get_category_or_404, get_prompt_or_404


router = APIRouter(tags=["prompts"])


@router.get("/workspaces/{workspace_id}/categories", response_model=list[PromptCategoryRead])
def list_categories(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    categories = db.scalars(
        select(PromptCategory)
        .where(PromptCategory.workspace_id == workspace_id)
        .order_by(PromptCategory.sort_order.asc(), PromptCategory.name.asc())
    ).all()
    counts = dict(
        db.execute(
            select(Prompt.category_id, func.count(Prompt.id))
            .where(Prompt.workspace_id == workspace_id)
            .group_by(Prompt.category_id)
        ).all()
    )
    return [
        PromptCategoryRead.model_validate(category, from_attributes=True).model_copy(
            update={"prompt_count": counts.get(category.id, 0)}
        )
        for category in categories
    ]


@router.post("/workspaces/{workspace_id}/categories", response_model=PromptCategoryRead, status_code=201)
def create_category(workspace_id: UUID, payload: CategoryCreate, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    category = PromptCategory(
        workspace_id=workspace_id,
        name=payload.name,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=PromptCategoryRead)
def update_category(category_id: UUID, payload: CategoryUpdate, db: DbSession):
    category = get_category_or_404(db, category_id)
    if payload.name is not None:
        category.name = payload.name
    if payload.sort_order is not None:
        category.sort_order = payload.sort_order
    if payload.is_active is not None:
        category.is_active = payload.is_active
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: UUID, db: DbSession, move_to_category_id: UUID | None = None):
    category = get_category_or_404(db, category_id)
    prompts = db.scalars(select(Prompt).where(Prompt.category_id == category_id)).all()

    if prompts and move_to_category_id is None:
        raise HTTPException(status_code=400, detail="Category is not empty. Provide move_to_category_id.")

    if prompts and move_to_category_id is not None:
        target_category = get_category_or_404(db, move_to_category_id)
        if target_category.workspace_id != category.workspace_id:
            raise HTTPException(status_code=400, detail="Target category must belong to the same workspace")
        for prompt in prompts:
            prompt.category_id = move_to_category_id

    db.delete(category)
    db.commit()


@router.get("/workspaces/{workspace_id}/prompts", response_model=PromptListRead)
def list_prompts(
    workspace_id: UUID,
    db: DbSession,
    category_ids: Annotated[list[UUID] | None, Query()] = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
):
    get_workspace_or_404(db, workspace_id)
    return build_prompt_list_response(
        db,
        workspace_id=workspace_id,
        category_ids=category_ids,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.post("/workspaces/{workspace_id}/prompts", response_model=PromptRead, status_code=201)
def create_prompt(workspace_id: UUID, payload: PromptCreate, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    category = get_category_or_404(db, payload.category_id)
    if category.workspace_id != workspace_id:
        raise HTTPException(status_code=400, detail="Category does not belong to this workspace")

    prompt = Prompt(
        workspace_id=workspace_id,
        category_id=payload.category_id,
        prompt_text=payload.prompt_text,
        target_brand=payload.target_brand,
        expected_competitors=payload.expected_competitors,
        selected_models=payload.selected_models,
        status=payload.status,
    )
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return prompt


@router.patch("/prompts/{prompt_id}", response_model=PromptRead)
def update_prompt(prompt_id: UUID, payload: PromptUpdate, db: DbSession):
    prompt = get_prompt_or_404(db, prompt_id)
    updates = payload.model_dump(exclude_unset=True)

    if "category_id" in updates:
        category = get_category_or_404(db, updates["category_id"])
        if category.workspace_id != prompt.workspace_id:
            raise HTTPException(status_code=400, detail="Category does not belong to the prompt workspace")

    for field, value in updates.items():
        setattr(prompt, field, value)

    db.commit()
    db.refresh(prompt)
    return prompt


@router.delete("/prompts/{prompt_id}", status_code=204)
def delete_prompt(prompt_id: UUID, db: DbSession):
    prompt = get_prompt_or_404(db, prompt_id)
    db.delete(prompt)
    db.commit()
