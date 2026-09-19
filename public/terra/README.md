# Terra imagery

`earth-day.jpg` is the 4096-pixel Earth day texture from the Three.js Earth example:
https://threejs.org/examples/textures/planets/earth_day_4096.jpg

`earth-clouds.jpg` is the example's packed bump/roughness/cloud texture, used
only for its blue cloud channel:
https://threejs.org/examples/textures/planets/earth_bump_roughness_clouds_4096.jpg

The example credits Solar System Scope for the source textures, resized and merged:
https://threejs.org/examples/webgpu_tsl_earth.html
https://www.solarsystemscope.com/textures/

Source texture license: Creative Commons Attribution 4.0 International.
https://creativecommons.org/licenses/by/4.0/

`eiffel-diorama-v1.png` is the AI-generated Paris diorama, created with the
OpenAI built-in image tool. Its exact model version is not exposed by the tool.
This raster illustration is retained as an unused design asset. The live journey
uses the map directly for every destination, including Paris.

Landmark geometry is streamed at runtime from Google Maps Photorealistic 3D Tiles
using the project's existing `VITE_GOOGLE_TILES_KEY`. No Google tiles are bundled
or persisted. The viewport shows Google Maps attribution and the active tiles'
data-provider credits. If the service is unavailable, the page explicitly switches
to a globe overview rather than presenting a substitute as a real landmark.

Route: `/gallery/terra`.
