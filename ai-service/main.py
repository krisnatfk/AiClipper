from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import random

app = FastAPI(title="AutoClip AI Tracker Service")

class TrackRequest(BaseModel):
    video_url: str
    target_fps: int = 10

class Keyframe(BaseModel):
    time: float
    x: float
    y: float
    width: float
    height: float

class TrackResponse(BaseModel):
    clip_id: str
    score: float
    keyframes: list[Keyframe]

def calculate_score(center_dist: float, area: float, movement: float, confidence: float) -> float:
    # score = (center_weight * proximity_to_center) + (size_weight * area) + (motion_weight * movement) + (confidence_weight * confidence)
    w_center = 0.4
    w_size = 0.3
    w_motion = 0.2
    w_conf = 0.1
    
    # Normalize inputs (assuming center_dist is 0-1 where 1 is center, area is 0-1, movement is 0-1, conf is 0-1)
    return (w_center * center_dist) + (w_size * area) + (w_motion * movement) + (w_conf * confidence)

@app.post("/track", response_model=TrackResponse)
def track_video(req: TrackRequest):
    """
    Simulated tracking endpoint for MVP.
    In a real scenario, this would use OpenCV/YOLO/MediaPipe to:
    - Extract frames at target_fps
    - Run YOLO/MediaPipe on each frame
    - Calculate score for each detected object
    - Select the object with highest average score across the video
    - Return interpolated keyframes for that object
    """
    
    if not req.video_url:
        raise HTTPException(status_code=400, detail="video_url is required")
        
    print(f"Starting tracking for {req.video_url}")
    
    # Simulate processing time and result
    duration = 10.0 # simulate 10s video
    keyframes = []
    
    for i in range(int(duration * req.target_fps)):
        time_sec = i / req.target_fps
        # Simulate a moving box
        keyframes.append(
            Keyframe(
                time=time_sec,
                x=40 + (random.random() * 5 - 2.5), # slight jitter
                y=40 + (random.random() * 5 - 2.5),
                width=20,
                height=20
            )
        )
        
    best_score = calculate_score(0.9, 0.4, 0.5, 0.95)
        
    return TrackResponse(
        clip_id="dummy_clip",
        score=best_score * 100, # return as percentage 0-100
        keyframes=keyframes
    )

@app.get("/health")
def health():
    return {"status": "ok"}
