from fastapi import APIRouter, Depends

from ..data_loader import DataStore, get_store
from ..models.schemas import FilterOptionsResponse

router = APIRouter()


@router.get("/options", response_model=FilterOptionsResponse)
def get_filter_options(store: DataStore = Depends(get_store)) -> FilterOptionsResponse:
    offices = store.offices[["office_id", "office_name", "region"]].to_dict("records")
    regions = sorted(store.offices["region"].unique().tolist())
    subspecialties = sorted(store.providers["subspecialty"].unique().tolist())
    return FilterOptionsResponse(offices=offices, regions=regions, subspecialties=subspecialties)
