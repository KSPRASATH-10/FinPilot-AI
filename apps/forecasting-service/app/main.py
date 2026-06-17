from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import statistics
import math
from datetime import datetime, timedelta

app = FastAPI(title="FinPilot Forecasting Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Transaction(BaseModel):
    date: str
    amount: float
    category: Optional[str] = "General"
    description: Optional[str] = ""


class ForecastRequest(BaseModel):
    transactions: List[Transaction]
    forecast_months: Optional[int] = 3


class CategoryForecast(BaseModel):
    category: str
    current_avg: float
    forecast: List[float]
    trend: str


class ForecastResponse(BaseModel):
    total_forecast: List[float]
    category_forecasts: List[CategoryForecast]
    health_trend: str
    recommendations: List[str]


class AnomalyRequest(BaseModel):
    transactions: List[Transaction]


class AnomalyResponse(BaseModel):
    anomalies: List[Dict]
    summary: str


def simple_ma_forecast(values: List[float], steps: int) -> List[float]:
    if not values:
        return [0.0] * steps
    window = min(3, len(values))
    base = statistics.mean(values[-window:])
    if len(values) >= 2:
        trend = (values[-1] - values[0]) / max(len(values) - 1, 1)
    else:
        trend = 0.0
    trend = max(min(trend, base * 0.1), -base * 0.1)
    return [round(base + trend * (i + 1), 2) for i in range(steps)]


def compute_trend_label(values: List[float]) -> str:
    if len(values) < 2:
        return "stable"
    delta = values[-1] - values[0]
    pct = (delta / max(values[0], 1)) * 100
    if pct > 10:
        return "increasing"
    if pct < -10:
        return "decreasing"
    return "stable"


@app.get("/health")
def health():
    return {"status": "ok", "service": "forecasting", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/v1/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    if not req.transactions:
        raise HTTPException(status_code=400, detail="transactions list is empty")

    months_range: Dict[str, Dict[str, float]] = {}
    for tx in req.transactions:
        try:
            dt = datetime.fromisoformat(tx.date.replace("Z", "+00:00"))
        except Exception:
            dt = datetime.utcnow()
        key = dt.strftime("%Y-%m")
        cat = tx.category or "General"
        if key not in months_range:
            months_range[key] = {}
        months_range[key][cat] = months_range[key].get(cat, 0) + tx.amount

    sorted_months = sorted(months_range.keys())
    all_categories = {cat for m in months_range.values() for cat in m}

    cat_forecasts = []
    total_by_month: Dict[str, float] = {m: sum(months_range[m].values()) for m in sorted_months}
    total_values = [total_by_month[m] for m in sorted_months]
    total_fc = simple_ma_forecast(total_values, req.forecast_months)

    for cat in sorted(all_categories):
        cat_values = [months_range[m].get(cat, 0) for m in sorted_months]
        fc = simple_ma_forecast(cat_values, req.forecast_months)
        avg = statistics.mean(cat_values) if cat_values else 0
        cat_forecasts.append(CategoryForecast(
            category=cat,
            current_avg=round(avg, 2),
            forecast=fc,
            trend=compute_trend_label(cat_values),
        ))

    health_trend = compute_trend_label(total_values)

    recommendations = []
    for cf in cat_forecasts:
        if cf.trend == "increasing" and cf.current_avg > 3000:
            recommendations.append(
                f"{cf.category} spend is trending up (avg ₹{cf.current_avg:,.0f}/month). Consider setting a monthly cap."
            )
    if not recommendations:
        recommendations.append("Your spending patterns look stable. Keep monitoring monthly for drift.")
    if health_trend == "increasing":
        recommendations.insert(0, "Overall expenses are increasing. Review discretionary categories to contain growth.")

    return ForecastResponse(
        total_forecast=total_fc,
        category_forecasts=cat_forecasts,
        health_trend=health_trend,
        recommendations=recommendations[:5],
    )


@app.post("/api/v1/anomalies", response_model=AnomalyResponse)
def detect_anomalies(req: AnomalyRequest):
    if not req.transactions:
        return AnomalyResponse(anomalies=[], summary="No transactions provided.")

    by_cat: Dict[str, List[float]] = {}
    for tx in req.transactions:
        cat = tx.category or "General"
        by_cat.setdefault(cat, []).append(tx.amount)

    anomalies = []
    for tx in req.transactions:
        cat = tx.category or "General"
        vals = by_cat[cat]
        if len(vals) < 2:
            continue
        mean = statistics.mean(vals)
        stdev = statistics.stdev(vals) if len(vals) > 1 else 0
        if stdev > 0 and abs(tx.amount - mean) > 2 * stdev:
            anomalies.append({
                "date": tx.date,
                "category": cat,
                "amount": tx.amount,
                "mean": round(mean, 2),
                "deviation": round(abs(tx.amount - mean) / stdev, 2),
                "description": tx.description,
            })

    summary = (
        f"Detected {len(anomalies)} anomalous transaction(s) across {len(by_cat)} categories."
        if anomalies
        else "No spending anomalies detected. All transactions within normal range."
    )

    return AnomalyResponse(anomalies=anomalies, summary=summary)
