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


class AlertResponse(BaseModel):
    overcrowded_zones: List[Zone]


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str


class UserInputResponse(BaseModel):
    message: str
    preference: str
    matched_zones: Optional[List[Zone]] = None


ZONES: List[Zone] = [
    Zone(id=1, name="Gate A", crowd_level=24, wait_time=4),
    Zone(id=2, name="Gate C", crowd_level=86, wait_time=18),
    Zone(id=3, name="Food Court B", crowd_level=42, wait_time=9),
    Zone(id=4, name="Food Court D", crowd_level=29, wait_time=6),
    Zone(id=5, name="Exit North", crowd_level=35, wait_time=7),
    Zone(id=6, name="Exit South", crowd_level=91, wait_time=21),
]


def find_zone(zone_id: int) -> Optional[Zone]:
    for zone in ZONES:
        if zone.id == zone_id:
            return zone
    return None


def crowd_score(crowd_level: int) -> int:
    return 100 - crowd_level


def zone_status(score: int) -> str:
    if score > 70:
        return "Low crowd"
    if score >= 40:
        return "Medium crowd"
    return "High crowd"


def least_crowded_zone() -> Optional[Zone]:
    if not ZONES:
        return None
    return min(ZONES, key=lambda zone: zone.crowd_level)


def best_food_zone() -> Optional[Zone]:
    food_zones = [zone for zone in ZONES if "food" in zone.name.lower()]
    if not food_zones:
        return None
    return min(food_zones, key=lambda zone: zone.crowd_level)


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

    score = crowd_score(zone.crowd_level)
    return ScoreResponse(
        zone_id=zone.id,
        crowd_score=score,
        status=zone_status(score),
    )


@app.post("/api/recommend", response_model=RecommendResponse)
def recommend_zones() -> RecommendResponse:
    recommended = [zone for zone in ZONES if crowd_score(zone.crowd_level) > 70]
    return RecommendResponse(recommended_zones=recommended)


@app.get("/api/alerts", response_model=AlertResponse)
def get_alerts() -> AlertResponse:
    overcrowded = [zone for zone in ZONES if zone.crowd_level > 80]
    return AlertResponse(overcrowded_zones=overcrowded)


@app.post("/api/chat", response_model=ChatResponse)
def chat_assistant(payload: ChatRequest) -> ChatResponse:
    question = payload.question.strip().lower()

    if "best" in question:
        best_zone = least_crowded_zone()
        if best_zone is None:
            return ChatResponse(answer="No zones are available right now.")
        return ChatResponse(
            answer=f"Best option now is {best_zone.name} with crowd level {best_zone.crowd_level}% and wait time {best_zone.wait_time} minutes."
        )

    if "food" in question:
        food_zone = best_food_zone()
        if food_zone is None:
            return ChatResponse(answer="No food zones are available right now.")
        return ChatResponse(
            answer=f"Best food option is {food_zone.name} with crowd level {food_zone.crowd_level}% and wait time {food_zone.wait_time} minutes."
        )

    return ChatResponse(
        answer="Ask about best route or food to get a zone recommendation."
    )
