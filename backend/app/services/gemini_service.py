import os
import json
import base64
from typing import AsyncGenerator, Optional, List, Dict, Any
from google import genai
from google.genai import types
from ..config import settings

OPENSCAD_SYSTEM_INSTRUCTION = """You are an elite 3D CAD engineer and OpenSCAD specialist.
You generate robust, elegant, parametric OpenSCAD code and help the user design 3D-printable or machinable models.

CRITICAL OPENSCAD GUIDELINES:
1. Always write parametric code:
   - Place all customizable dimensions at the top.
   - Use standard OpenSCAD Customizer comment annotations (e.g. `/* [Parameters] */`, `width = 50; // [10:100]`).
2. Robust CSG modeling for the Manifold engine:
   - When subtracting objects using difference(), ensure the cutting tool extends slightly beyond the base object (e.g. `translate([0, 0, -0.01]) ... h = depth + 0.02`) to prevent zero-thickness coincident faces or non-manifold errors.
   - Set `$fn = 32;` or clean circle resolution.
3. Structure & Modularity:
   - Break complex models into reusable `module name() { ... }` blocks.
   - Maintain symmetry and standard CAD alignment.
4. Response format:
   - Explain your design logic briefly.
   - Provide the complete or updated OpenSCAD code inside a ```openscad ... ``` code fence.
   - If modifying existing code, highlight what was changed.
"""

class GeminiService:
    def __init__(self):
        self._client: Optional[genai.Client] = None
        self._current_api_key: Optional[str] = None

    def get_client(self) -> genai.Client:
        # Re-read key if not initialized or updated in environment
        api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not configured. Please set your Gemini API key in the settings or .env file.")
        
        if self._client is None or self._current_api_key != api_key:
            self._client = genai.Client(api_key=api_key)
            self._current_api_key = api_key
        return self._client

    def _get_candidate_models(self, preferred_model: str) -> List[str]:
        # Priority order with seamless fallbacks
        candidates = [preferred_model]
        for fallback in ["gemini-3.5-flash", "gemini-2.5-pro", "gemini-3.8-flash"]:
            if fallback not in candidates:
                candidates.append(fallback)
        return candidates

    async def stream_chat(
        self,
        prompt: str,
        current_code: Optional[str] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        model_name: str = "gemini-3.5-flash"
    ) -> AsyncGenerator[str, None]:
        client = self.get_client()

        # Build context
        contents = []
        if chat_history:
            for msg in chat_history:
                role = "user" if msg.get("role") == "user" else "model"
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.get("content", ""))]
                ))

        user_content_text = ""
        if current_code and current_code.strip():
            user_content_text += f"Current OpenSCAD Code:\n```openscad\n{current_code}\n```\n\n"
        user_content_text += f"User Request: {prompt}"

        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_content_text)]
        ))

        config = types.GenerateContentConfig(
            system_instruction=OPENSCAD_SYSTEM_INSTRUCTION,
            temperature=0.4,
        )

        models_to_try = self._get_candidate_models(model_name)
        last_error = None

        for candidate in models_to_try:
            try:
                # Use native non-blocking async streaming API
                response_stream = await client.aio.models.generate_content_stream(
                    model=candidate,
                    contents=contents,
                    config=config,
                )
                async for chunk in response_stream:
                    if chunk.text:
                        yield chunk.text
                return
            except Exception as e:
                err_str = str(e)
                last_error = e
                # Fall back to alternative models if capacity/availability issues occur
                if "503" in err_str or "404" in err_str or "UNAVAILABLE" in err_str or "NOT_FOUND" in err_str:
                    continue
                else:
                    raise e

        if last_error:
            raise last_error

    async def fix_errors(
        self,
        current_code: str,
        compiler_errors: str,
        model_name: str = "gemini-3.5-flash"
    ) -> AsyncGenerator[str, None]:
        client = self.get_client()

        prompt = (
            f"The following OpenSCAD code produced compiler errors when running with the Manifold engine.\n"
            f"Please diagnose and fix all errors, and output the corrected full OpenSCAD code.\n\n"
            f"Compiler Output:\n```\n{compiler_errors}\n```\n\n"
            f"Faulty Code:\n```openscad\n{current_code}\n```\n"
        )

        config = types.GenerateContentConfig(
            system_instruction=OPENSCAD_SYSTEM_INSTRUCTION,
            temperature=0.2,
        )

        models_to_try = self._get_candidate_models(model_name)
        last_error = None

        for candidate in models_to_try:
            try:
                response_stream = await client.aio.models.generate_content_stream(
                    model=candidate,
                    contents=[prompt],
                    config=config,
                )
                async for chunk in response_stream:
                    if chunk.text:
                        yield chunk.text
                return
            except Exception as e:
                err_str = str(e)
                last_error = e
                if "503" in err_str or "404" in err_str or "UNAVAILABLE" in err_str:
                    continue
                else:
                    raise e

        if last_error:
            raise last_error

    async def vision_review(
        self,
        current_code: str,
        image_bytes: bytes,
        user_prompt: str,
        mime_type: str = "image/png",
        model_name: str = "gemini-3.5-flash"
    ) -> AsyncGenerator[str, None]:
        client = self.get_client()

        image_part = types.Part.from_bytes(
            data=image_bytes,
            mime_type=mime_type,
        )
        text_part = types.Part.from_text(
            text=(
                f"Attached is an image render of the 3D model generated by the current OpenSCAD code:\n"
                f"```openscad\n{current_code}\n```\n\n"
                f"Review request: {user_prompt}\n"
                f"Please inspect the visual geometry, proportions, and details, and provide improved OpenSCAD code."
            )
        )

        config = types.GenerateContentConfig(
            system_instruction=OPENSCAD_SYSTEM_INSTRUCTION,
            temperature=0.3,
        )

        models_to_try = self._get_candidate_models(model_name)
        last_error = None

        for candidate in models_to_try:
            try:
                response_stream = await client.aio.models.generate_content_stream(
                    model=candidate,
                    contents=[types.Content(parts=[image_part, text_part])],
                    config=config,
                )
                async for chunk in response_stream:
                    if chunk.text:
                        yield chunk.text
                return
            except Exception as e:
                err_str = str(e)
                last_error = e
                if "503" in err_str or "404" in err_str or "UNAVAILABLE" in err_str:
                    continue
                else:
                    raise e

        if last_error:
            raise last_error

gemini_service = GeminiService()
