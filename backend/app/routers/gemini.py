import base64
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from ..config import settings
from ..services.gemini_service import gemini_service

router = APIRouter(prefix="/api/gemini", tags=["gemini"])

class ChatRequest(BaseModel):
    prompt: str = Field(..., description="User prompt or instructions")
    current_code: Optional[str] = Field(None, description="Current code in the editor")
    chat_history: Optional[List[Dict[str, str]]] = Field(None, description="Prior conversation messages")
    model: str = Field("gemini-3.5-flash", description="Gemini model identifier")

class FixRequest(BaseModel):
    current_code: str = Field(..., description="Code that caused compilation errors")
    compiler_errors: str = Field(..., description="OpenSCAD compiler stderr output")
    model: str = Field("gemini-3.5-flash", description="Gemini model identifier")

class VisionRequest(BaseModel):
    current_code: str = Field(..., description="Current OpenSCAD code")
    image_base64: str = Field(..., description="Base64 encoded snapshot of 3D render")
    prompt: str = Field("Critique the geometry and suggest improvements", description="User guidance")
    model: str = Field("gemini-3.5-flash", description="Gemini model identifier")

class ApiKeyRequest(BaseModel):
    api_key: str = Field(..., description="Google Gemini API Key")

@router.get("/status")
def get_gemini_status():
    has_key = bool(settings.GEMINI_API_KEY)
    return {
        "configured": has_key,
        "default_model": "gemini-3.5-flash",
        "available_models": ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-2.5-pro"]
    }

@router.post("/key")
def set_api_key(req: ApiKeyRequest):
    settings.GEMINI_API_KEY = req.api_key.strip()
    return {"success": True, "message": "API key updated successfully"}

@router.post("/chat")
async def chat_stream(req: ChatRequest):
    try:
        async def event_generator():
            try:
                async for chunk in gemini_service.stream_chat(
                    prompt=req.prompt,
                    current_code=req.current_code,
                    chat_history=req.chat_history,
                    model_name=req.model
                ):
                    data = json.dumps({"text": chunk})
                    yield f"data: {data}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                err_data = json.dumps({"error": str(e)})
                yield f"data: {err_data}\n\n"
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/fix")
async def fix_stream(req: FixRequest):
    try:
        async def event_generator():
            try:
                async for chunk in gemini_service.fix_errors(
                    current_code=req.current_code,
                    compiler_errors=req.compiler_errors,
                    model_name=req.model
                ):
                    data = json.dumps({"text": chunk})
                    yield f"data: {data}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                err_data = json.dumps({"error": str(e)})
                yield f"data: {err_data}\n\n"
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/vision")
async def vision_stream(req: VisionRequest):
    try:
        raw_b64 = req.image_base64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(raw_b64)

        async def event_generator():
            try:
                async for chunk in gemini_service.vision_review(
                    current_code=req.current_code,
                    image_bytes=image_bytes,
                    user_prompt=req.prompt,
                    model_name=req.model
                ):
                    data = json.dumps({"text": chunk})
                    yield f"data: {data}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                err_data = json.dumps({"error": str(e)})
                yield f"data: {err_data}\n\n"
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
