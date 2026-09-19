# Generated fitting reference

Generated on 2026-09-15 with the user's approval to use fictional sample inputs.

- Local image: `public/fitting-demo/person.png`
- Preview path: `/fitting-demo/person.png`
- Image provider: Higgsfield, Nano Banana 2 (`nano_banana_flash`), 2k, 2:3.
- Output: https://d8j0ntlcm91z4.cloudfront.net/user_3JJUT0MKENj8oBi491QAY0Jiqty/hf_20260915_050915_c9eee091-618a-43b9-adef-8f472665d2fb.png
- The person is AI-generated, not a photograph of the user. The downloaded image was visually inspected: one fully clothed adult, complete body and shoes visible. The arms are closer to the torso than the requested A-pose, which may reduce reconstruction quality.

## Prompt

Photorealistic studio reference photograph of one entirely fictional adult Korean male fashion model, age 28, short neatly styled black hair, neutral expression, natural realistic face and body proportions. Full body head to toe centered, both hands and both white low-top sneakers completely visible, standing upright facing the camera in a relaxed symmetrical A-pose with arms about 25 degrees away from the torso, fingers relaxed and separated, feet shoulder width apart. Wearing a plain fitted off-white short-sleeve crew-neck T-shirt and straight charcoal trousers. Seamless pure white background, soft even neutral studio illumination, very faint contact shadow, clear edges and textile details, 85 mm lens look with minimal perspective distortion. Single front view for 3D reconstruction, no collage, no extra person, no props, no accessories, no brand logos, no text, no watermark.

## Live generation results

The reference image completed successfully. No fitted image or GLB was generated:

1. `product-photoshoot create --mode product_shot` for an olive utility jacket returned `job_minimum_basic_plan_required`.
2. `image_to_3d` returned `Unsupported validation rule for image_to_3d: !params.enable_animation || params.enable_rigging` with Higgsfield CLI 1.1.24. This occurs before 3D job submission. The alternative `multi_image_to_3d` schema contains the same rule, so it was not submitted.
3. `tripo_h3_1_image_to_3d`, whose schema has no such validation rules, returned `not_enough_credits` for the private workspace on the free plan.

No subscription was purchased, no credits were added, and no website was deployed. The Lab still uses its labeled procedural mannequin by default. This image does not establish that the live fitting or 3D generation workflow works.
