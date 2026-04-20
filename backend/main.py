from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Smart Event Assistant API")

# Allow frontend apps to call this API during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UserInputRequest(BaseModel):
    preference: str


class Zone(BaseModel):
    id: int
    name: str
    crowd_level: int
    wait_time: int


class ScoreRequest(BaseModel):
    zone_id: int


class ScoreResponse(BaseModel):
    zone_id: int
    crowd_score: int
    status: str


class RecommendResponse(BaseModel):
    recommended_zones: List[Zone]


class UserInputResponse(BaseModel):
    message: str
    preference: str
    matched_zones: Optional[List[Zone]] = None


ZONES: List[Zone] = [
    Zone(id=1, name="North Gate", crowd_level=25, wait_time=5),
    Zone(id=2, name="South Gate", crowd_level=82, wait_time=22),
    Zone(id=3, name="Food Court", crowd_level=40, wait_time=8),
    Zone(id=4, name="Restroom Block A", crowd_level=18, wait_time=3),
    Zone(id=5, name="East Stand", crowd_level=70, wait_time=15),
]


def find_zone(zone_id: int) -> Optional[Zone]:
    for zone in ZONES:
        if zone.id == zone_id:
            return zone
    return None


def zone_status(crowd_level: int) -> str:
    if crowd_level < 35:
        return "Low crowd"
    if crowd_level <= 70:
        return "Medium crowd"
    return "High crowd"


@app.post("/api/user-input", response_model=UserInputResponse)
def user_input(payload: UserInputRequest) -> UserInputResponse:
    pref = payload.preference.strip().lower()

    keyword_map = {
        "food": "food",
        "restroom": "restroom",
        "gate": "gate",
    }

    matched: List[Zone] = []
    for keyword, label in keyword_map.items():
        if keyword in pref:
            matched = [zone for zone in ZONES if label in zone.name.lower()]
            break

    return UserInputResponse(
        message="Preference received",
        preference=payload.preference,
        matched_zones=matched or None,
    )


@app.get("/api/zones", response_model=List[Zone])
def get_zones() -> List[Zone]:
    return ZONES


@app.post("/api/score", response_model=ScoreResponse)
def score_zone(payload: ScoreRequest) -> ScoreResponse:
    zone = find_zone(payload.zone_id)
    if zone is None:
        raise HTTPException(status_code=404, detail="Zone not found")

    crowd_score = 100 - zone.crowd_level
    return ScoreResponse(
        zone_id=zone.id,
        crowd_score=crowd_score,
        status=zone_status(zone.crowd_level),
    )


@app.post("/api/recommend", response_model=RecommendResponse)
def recommend_zones() -> RecommendResponse:
    recommended = [zone for zone in ZONES if (100 - zone.crowd_level) > 70]
    return RecommendResponse(recommended_zones=recommended)
