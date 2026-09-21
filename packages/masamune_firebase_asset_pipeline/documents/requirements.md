# Autonomous Asset Creation System

# Concept

Runs on Cloud Functions for Firebase (2nd Gen).

After thoroughly researching and validating a supplied theme or asset, the application generates videos and images

and automatically uploads them to YouTube, Instagram, TikTok, and stock media services such as AdobeStock.

- Continuously create multiple videos and images from predefined themes (channel themes) or supplied assets.
    - Input may be a short theme description or an asset such as an image, short video, or music.
    - Research one theme broadly and create multiple videos or images.
- Determine content through DeepResearch or research of comparable depth.
    - Research in two stages:
        1. Broadly research the supplied channel theme to choose a topic for the current video or image.
            - Also check for overlap with previously created videos and images.
        2. Investigate the selected topic in depth to prepare it for a video or image.
            - DeepResearch, including web searches, is required.
- Break videos into detailed scenes and generate each scene separately; scene segmentation is important.
- For videos, generate data specifying backgrounds, music, and narration in detail for each section, to be used during video generation.
- Read and write all research results, section breakdowns, and section details through Firestore.
- Use Cloud Storage for Firebase for intermediate and final assets.
- Upload and distribute final assets to YouTube, Instagram, TikTok, AdobeStock, and other services through their APIs.
    - A human performs the final publishing check in each service's console. For example, upload a YouTube video as unlisted, then have a human make it public.
- DeepResearch and video generation/composition take time, so use HTTP calls to Cloud Functions for Firebase (2nd Gen) to allow the full 60-minute execution window.
- Support both manual generation through HTTP triggers and periodic automatic generation through a scheduler.
- Label AI-generated source assets and store their metadata, including vectors, in Firestore, with the actual files in Cloud Storage, for later reuse.

## Development Structure

- Implement everything in TypeScript using the Masamune framework's backend facilities.
- Split functionality into multiple functions:
    - HTTP-triggered creation function
        - Accept creation requests containing a channel theme or image, video, or audio assets.
        - Save data to Firestore and Storage, then invoke the research-start function.
    - Scheduled creation function
        - Read the channel theme and last creation timestamp from Firestore. Once the configured interval has elapsed, invoke the research-start function to create assets based on that theme.
    - Broad research function
        - Choose a topic for the current asset from the initial request or the channel theme stored in Firestore.
        - Gather topic candidates broadly from the web.
        - Use Firestore vector search to check each candidate for duplicates.
        - Select one nonduplicate topic, save it and its search vectors to Firestore, then invoke detailed research.
        - Example:
            - For a channel theme of "Western history," candidates include events such as the Hundred Years' War or French Revolution, people such as Hitler or Napoleon, and structures such as Western castles.
    - Detailed research function
        - Start upon a request from broad research.
        - Perform DeepResearch using the web and other sources.
        - Always collect enough information for a 10–15-minute video.
        - Save all collected information to Firestore. Depending on the asset, invoke the short video metadata, video metadata, manga metadata, or image metadata function.
    - Short video metadata initiation function
        - Start upon a request from detailed research.
        - Load detailed research from Firestore and create metadata for a short video of approximately 60 seconds.
        - Create overall video metadata, followed by an outline and detailed short video data.
        - Video metadata includes:
            - Video title
            - Video description
            - Promotional text
            - Keywords
            - Supported languages
        - The short video outline includes:
            - Video details
            - Visual atmosphere
            - Musical atmosphere
        - Use the outline to create detailed textual direction for the short video.
            - Generate all visual motion, musical atmosphere, effects (including sound effects), and narration text.
                - Instead of using video-generation AI, generate images with image AI or find existing images in Firestore, then animate them using FFmpeg filters, transitions, pans, and zooms.
                    - Search Firestore first and reuse suitable existing images.
                    - Describe images in enough detail to serve directly as prompts that produce the intended visuals.
                    - Define a structure such as JSON for the direction data passed to FFmpeg to animate images.
                    - Multiple images may be created depending on video duration.
                - Describe BGM and sound effects in prompt-ready detail, including duration, atmosphere, and instruments.
                    - Specify that Firestore should be searched for existing audio to reuse.
                - Adjust narration text length to fit the video duration.
                - Aim for dopamine-stimulating engagement through a brisk pace and plentiful light and sound effects, while keeping the result natural.
        - Save all video metadata and short video content to Firestore, then invoke short video generation.
    - Short video generation function
        - Start upon a request from short video metadata generation.
        - Generate the video as follows:
            1. Send narration text to Google Text-to-Speech to generate speech.
                - Adjust it to the scene duration.
            2. Retrieve BGM from Storage or generate it with Lyria to suit the narration, then mix it using FFmpeg.
                - Label AI-generated audio, generate its vectors, and save it to Firestore and Storage.
                - Use FFmpeg ducking to make the narration stand out in the mix.
            3. Generate images or retrieve them from Cloud Storage to match the audio duration, animate them with FFmpeg into a video, and combine the result with the audio.
            4. Upload the finished video to Cloud Storage.
        - Set the video-complete flag after generation and invoke video distribution.
        - Also generate YouTube subtitles based on the video's duration and save them to Cloud Storage.
    - Video metadata initiation function
        - Start upon a request from detailed research.
        - Load detailed research from Firestore and create video-generation metadata.
        - Create overall video metadata, a scene breakdown, and scene outlines.
        - Split the research into scenes that make the content easy to explain on video.
        - Video metadata includes:
            - Video title
            - Video description
            - Promotional text
            - Keywords
            - Supported languages
        - Each scene includes:
            - Scene name
            - Duration in seconds (adjusted to the content)
            - Scene details
            - Visual atmosphere
            - Musical atmosphere
        - Adjust the combined scenes to a maximum duration of approximately 10 minutes.
        - Save all video metadata and scene content to Firestore, then invoke scene video metadata generation for each scene.
    - Scene video metadata function
        - Start upon a request from video metadata initiation.
        - Run in parallel for each scene.
        - Generate detailed motion directions within the scene for video production.
        - Generate all visual motion, musical atmosphere, effects (including sound effects), and narration text.
            - Instead of using video-generation AI, generate images with image AI or find existing images in Firestore, then animate them using FFmpeg filters, transitions, pans, and zooms.
                - Search Firestore first and reuse suitable existing images.
                - Describe images in enough detail to serve directly as prompts that produce the intended visuals.
                - Define a structure such as JSON for the direction data passed to FFmpeg to animate images.
                - Multiple images may be created depending on scene duration.
            - Describe BGM and sound effects in prompt-ready detail, including duration, atmosphere, and instruments.
                - Specify that Firestore should be searched for existing audio to reuse.
            - Adjust narration text length to fit the scene duration.
            - Aim for dopamine-stimulating engagement through a brisk pace and plentiful light and sound effects, while keeping the result natural.
        - Save generated video information to Firestore and invoke scene video generation.
    - Scene video generation function
        - Start upon a request from scene video metadata generation.
        - Continue the per-scene parallel workflow started by scene video metadata generation.
        - Generate the video as follows:
            1. Send narration text to Google Text-to-Speech to generate speech.
                - Adjust it to the scene duration.
            2. Retrieve BGM from Storage or generate it with Lyria to suit the narration, then mix it using FFmpeg.
                - Label AI-generated audio, generate its vectors, and save it to Firestore and Storage.
                - Use FFmpeg ducking to make the narration stand out in the mix.
            3. Generate images or retrieve them from Cloud Storage to match the audio duration, animate them with FFmpeg into a video, and combine the result with the audio.
            4. Upload the finished video to Cloud Storage.
        - Once all videos required for the scene are generated, set the scene's video-complete flag in Firestore and invoke video composition.
        - Also generate YouTube subtitles based on the video's duration and save them to Cloud Storage.
    - Video composition function
        - Start upon a request from the video composition function.
        - Check that every scene's video-complete flag is set before proceeding.
        - Join all composed scene videos in order.
        - Once all videos are joined, set the video-generation-complete flag in Firestore and invoke video distribution.
    - Manga metadata function
        - Start upon a request from detailed research.
        - Load detailed research from Firestore and create metadata for manga that fits on one A4 page.
        - Create overall manga metadata, followed by an outline and detailed manga data.
        - Manga metadata includes:
            - Manga title
            - Manga description
            - Promotional text
            - Keywords
            - Supported languages
        - The manga outline includes:
            - Manga details
            - Illustration atmosphere
            - Dialogue atmosphere
        - Use the outline to create detailed textual manga data.
            - Create detailed image descriptions and dialogue for every panel.
                - Provide enough detail that the text can be passed directly as a prompt to generate the intended image.
                - Use a brisk but natural pace to encourage dopamine-stimulating engagement.
        - Save all manga metadata and content to Firestore, then invoke manga generation.
    - Manga generation function
        - Start upon a request from manga metadata generation.
        - Generate images with Gemini's NanoBanana.
        - Pass prompts to Gemini to generate images and save them to Cloud Storage.
        - After image generation, set the image-complete flag and invoke image distribution.
    - Image metadata function
        - Start upon a request from detailed research.
        - Load detailed research from Firestore and create image metadata.
        - Create overall image metadata, followed by an outline and detailed image data.
        - Image metadata includes:
            - Image title
            - Image description
            - Promotional text
            - Keywords
            - Supported languages
        - The manga outline includes:
            - Image details
            - Image atmosphere
        - Use the image outline to create detailed textual image data.
            - Create a detailed description of the entire image.
                - Provide enough detail that the text can be passed directly as a prompt to generate the intended image.
        - Save all image metadata and content to Firestore, then invoke image generation.
    - Image generation function
        - Start upon a request from image metadata generation.
        - Generate images with Gemini's NanoBanana.
        - Pass prompts to Gemini to generate images and save them to Cloud Storage.
        - After image generation, set the image-complete flag and invoke image distribution.
    - Video distribution function
        - Initiate uploading of finished videos to distribution services.
        - Invoke platform-specific functions based on the destination list stored in Firestore in the same document as the channel theme.
    - Image distribution function
        - Initiate uploading of finished images to distribution services.
        - Invoke platform-specific functions based on the destination list stored in Firestore in the same document as the channel theme.
    - YouTube distribution function
        - Handle short and regular videos.
        - Receive requests when YouTube is listed in video distribution.
        - Distribute finished videos through the YouTube API.
        - Load video metadata and configure it through the API.
        - Include subtitle data when available.
        - Publish as unlisted and send a notification by email or similar means.
    - Instagram distribution function
        - Handle short videos and images.
        - Receive requests when Instagram is listed in video or image distribution.
        - Distribute finished short videos and images through the Instagram API.
        - Load video/image metadata and configure it through the API.
    - TikTok distribution function
        - Handle short videos.
        - Receive requests when TikTok is listed in video or image distribution.
        - Distribute finished short videos and images through the TikTok API.
        - Load video metadata and configure it through the API.
    - X (Twitter) distribution function
        - Handle short videos and images.
        - Receive requests when X is listed in video or image distribution.
        - Distribute finished short videos and images through the X API.
        - Load video/image metadata and configure it through the API.
    - AdobeStock distribution function
        - Handle images.
        - Receive requests when AdobeStock is listed in image distribution.
        - Distribute finished images through the AdobeStock API.
        - Load image metadata and configure it through the API.
    - Suzuri distribution function
        - Handle images.
        - Receive requests when Suzuri is listed in image distribution.
        - Distribute finished images through the Suzuri API.
        - Load image metadata and configure it through the API.

## System Requirements

- Place source code under src/.
- Follow the existing functions under src/functions/, which contains the Firestore Cloud Functions implementation.
