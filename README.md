## What is this?

This is a web app which converts images into sound, providing an innovative way to experience visual data through audio. It maps image features like brightness and color to sound properties such as pitch and volume, creating a unique auditory representation of the visual input.

(Just a small part of a large project [we](#contributors) made, just sharing the core feature for everyone to play around with)

## Inspiration

This project draws inspiration from NASA's sonification efforts, such as their work on the "Pillars of Creation," where brightness and vertical position are mapped to pitch and volume. For more information on NASA's sonifications, visit their [Sonifications page](https://science.nasa.gov/mission/hubble/multimedia/sonifications/).


## Features and Working

The image processing pipeline extracts color and brightness information to generate sound. The steps include:

1. **Loading the Image**: The selected image is loaded onto an HTML canvas.
2. **Extracting Pixel Data**: The application scans the image column by column.
3. **Calculating Features**:
   - **Brightness** is calculated as the average of RGB values normalized to a 0-1 range.
   - **Hue** is determined based on the dominant color channel.
4. **Generating Audio Mapping**:
   - Brightness values control loudness.
   - Hue values are mapped to pitch or timbre.
   - Vertical position influences frequency.

## Limitations

While this app provides a compelling sonification experience, it is not perfect. It may not capture all visual complexities and requires some interpretation to fully appreciate the sounds generated.

## Comparison with Other Tools

Compared to other online sonification tools, this app offers a more user-friendly interface and creative mapping options. However, professional tools like NASA's sonifications may offer more refined outputs due to advanced processing.

## Usage

1. **Upload an Image**: Select an image file to sonify (preferably an image of a star cluster or galaxy, or you can have your fun with whichever photos you like).
2. **Adjust Settings**: Optionally, adjust mapping settings for brightness, color, and frequency.
3. **Play Sonification**: Click to hear the sonified version of your image.

## Contributors
- **Om Patil** - [GitHub](https://github.com/omleo789)
- **Lakshmi Sanjeev** - [GitHub](https://github.com/lassense)
- **Catherine George** - [GitHub](https://github.com/notkath)
- **Me :)**