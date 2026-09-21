# Development Roadmap

This document describes the phased development workflow for the autonomous asset creation system specified in `requirements.md`.

## Development Approach (API Key Preparation in Parallel)
Use mocks and emulators in early phases so development can proceed while API keys are being obtained.
Prioritize **YouTube** and **X (Twitter)**, adding other platforms in later phases.

## Phase 1: Infrastructure and Triggers
Build the entry-point triggers and data management infrastructure.
*Development can proceed without API keys.*

- [x] **Project setup**: Configure Cloud Functions (2nd Gen), Firestore, and Cloud Storage
- [x] **HTTP trigger function (`start_asset_creation`)**:
    - Receive channel themes and assets, then save initial data to Firestore
    - Set the research-start flag or invoke the broad research function
- [x] **Scheduler function (`schedule_asset_creation`)**:
    - Run periodically and check the last creation timestamp in Firestore
    - Start asset creation when the conditions are met

## Phase 2: Research and Planning
Implement theme selection and detailed research using DeepResearch.

- [x] **Broad research function (`conduct_broad_research`)**:
    - Collect candidate topics based on the channel theme using **Gemini (Grounding with Google Search)**
    - Check for duplicates against existing themes using Firestore vector search
    - Save the selected theme to Firestore and proceed to detailed research
- [x] **Detailed research function (`conduct_detailed_research`)**:
    - Run DeepResearch on the selected theme using **Gemini (Grounding with Google Search)**
    - Collect and organize information required for video/image generation and save it to Firestore (enough material for a 10–15-minute video)
    - Use AI to choose the asset type automatically (short video, long-form video, manga, or image)
    - Trigger the next process according to the asset type (return the function name)

## Phase 3: Short Video Generation Pipeline
Implement the workflow for generating short videos (approximately 60 seconds).

- [x] **Short video metadata function (`generate_short_video_metadata`)**:
    - Create video metadata from detailed research (title, description, keywords, promotional text, and language)
    - Generate the short video outline (details, visual atmosphere, and musical atmosphere)
    - Generate a detailed scene breakdown (visuals, audio, effects, transitions, and duration)
    - Output FFmpeg direction data as JSON
    - **Implemented using TDD (test-driven development)**
- [x] **Short video generation function (`generate_short_video`)**:
    - **Libraries**: `fluent-ffmpeg` (control), `ffmpeg-static` (binary), `@google-cloud/text-to-speech`, `google-auth-library`
    - **Implemented features**:
        - Video generation framework driven by scene metadata
        - FFmpeg effect mapper (zoom_in, zoom_out, pan, slide, etc.)
        - Automatic SRT subtitle generation
        - **Narration generation using Google Cloud TTS** (Neural2 voices)
        - **BGM generation using Lyria (Google Music AI)** (30-second instrumental music, converted from WAV to MP3)
        - **BGM fallback** (generate silent audio if the Lyria API fails)
        - **Mix narration and BGM with FFmpeg** and combine them with the video
        - **Image generation using Gemini 2.5 Flash Image**
        - Upload video, subtitle, and audio files to Cloud Storage
        - Automatic temporary-file cleanup
        - **Save generated files to test/tmp for testing**
    - **BGM generation details**:
        - Generate music from text prompts using the Lyria-002 model
        - Build prompts automatically from `musicAtmosphere` (for example, "epic orchestral")
        - Convert generated 48kHz WAV audio to 128kbps MP3
        - Fall back automatically to silent audio on errors
    - **Authentication**: Read service account information from `process.env.GOOGLE_SERVICE_ACCOUNT` and authenticate using GoogleAuth
    - **Testing pattern**: As in `google_token.test.ts`, tests load service account JSON from a file and set it in an environment variable
    - **TODO (next iteration)**:
        - Retrieve existing BGM/sound effects from Firestore/Storage
        - Check Vertex AI User permissions (the service account requires `aiplatform.endpoints.predict`)
        - Add sound effects
    - **Implemented using TDD (test-driven development)**
    - **Test files**: `test/generate_short_video.test.ts` (basic video generation), `test/generate_short_video_with_audio.test.ts` (video generation with audio)
    - **Outputs**:
        - Finished video (MP4, H.264, 1920x1080, 25fps, AAC audio)
        - Subtitles (SRT)
        - Narration audio (MP3)
        - BGM audio (MP3)

- [ ] **Short video composition function (`compose_short_video`)**:
    - Combine multiple generated parts if needed (the preceding function may handle the complete workflow).
    - Save the finished video to Cloud Storage

## Phase 4: Long-Form Video Generation Pipeline
Implement a scene-based workflow for generating long-form videos (10–15 minutes).

- [ ] **Video metadata function (`generate_video_metadata`)**:
    - Create the overall structure and split it into scenes using detailed research
    - Save metadata for each scene to Firestore
- [ ] **Scene metadata function (`generate_scene_metadata`)**:
    - Generate detailed direction and prompts for each scene (in parallel)
- [ ] **Scene video generation function (`generate_scene_video`)**:
    - **Change**: Generate videos with images, audio, and FFmpeg instead of Veo.
    - **Workflow**: Same as the short video generation function (images + audio + FFmpeg).
    - Run scenes in parallel.

- [ ] **Scene video composition function (`compose_scene_video`)**:
    - Combine generated video segments (created from images and audio) into scene videos
- [ ] **Full video composition function (`compose_full_video`)**:
    - Combine all scene videos into the final long-form video

## Phase 5: Still Image and Manga Generation Pipeline
Implement workflows for generating image and manga assets.

- [ ] **Manga metadata function (`generate_manga_metadata`)**:
    - Create the manga structure (panel layout, dialogue, and prompts)
- [ ] **Manga asset function (`generate_manga_assets`)**:
    - Generate manga images using Gemini or similar tools
- [ ] **Image metadata function (`generate_image_metadata`)**:
    - Create image metadata and prompts
- [ ] **Image asset function (`generate_image_assets`)**:
    - Generate images using Gemini or similar tools

## FFmpeg Direction Mechanism (New)

To maintain video quality and variety, AI (Gemini) generates **intermediate direction data (JSON)** instead of direct FFmpeg commands. The system interprets this data and converts it into suitable FFmpeg filter commands.

### Proposed Direction Data Structure (JSON)

```json
{
  "scenes": [
    {
      "visual": {
        "image_query": "medieval castle sunset", // Image search/generation query
        "effect": {
          "type": "zoom_in", // zoom_in, zoom_out, pan_left, pan_right, static, slide_up...
          "intensity": "medium" // low, medium, high
        },
        "transition": {
          "type": "crossfade", // crossfade, fade_black, wipe...
          "duration": 1.0
        }
      },
      "audio": {
        "narration_text": "At that moment, history changed...",
        "bgm_file_id": "epic_battle_01", // Firestore ID
        "se_file_ids": ["sword_clash_01"]
      },
      "duration": 5.0 // Seconds (can also adjust automatically to narration length)
    }
  ]
}
```

### Implementation Approach
1. **Effect Mapper**: Implement logic that converts abstract directions such as `zoom_in` into concrete parameters for FFmpeg filters such as `zoompan`.
    - **Stability**: Encapsulate complex filter syntax in code to prevent errors.
    - **Variation**: Randomize parameters such as speed and starting position so that the same `zoom_in` direction produces different motion each time.
2. **Asset Manager**: To improve image and audio reuse, manage all generated/retrieved assets by hash or ID and save them to Firestore with metadata such as prompts and atmosphere tags.

---

## Phase 6: Distribution and Publishing (YouTube & X)
Implement uploads of generated assets to the priority platforms.

- [ ] **Video/image distribution functions**:
    - Invoke each platform's distribution function according to destination settings
- [ ] **YouTube distribution function**: Upload videos/shorts and configure metadata
- [ ] **X (Twitter) distribution function**: Post images and videos

## Phase 7: Additional Distribution Platforms (Future)
Add the following platforms in later iterations.

- [ ] **Instagram distribution function**: Upload images and Reels
- [ ] **TikTok distribution function**: Upload short videos
- [ ] **AdobeStock distribution function**: Upload images
- [ ] **Suzuri distribution function**: Register merchandise using images, etc.

## Development Workflow
1. Create a branch for each phase.
2. **Follow test-driven development (TDD)**: Write tests before implementing each function and develop while verifying that the tests pass.
3. Design each function to be independently testable.
4. Use the Firestore emulator for thorough local verification.
