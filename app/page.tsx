"use client";

import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DotPattern } from "@/components/magicui/dot";
import { Upload } from "lucide-react";
import { GridPattern } from "@/components/magicui/grid";
import ShinyText from "@/components/magicui/shiny-text";
import FadeContent from "@/components/magicui/fade-content";

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: Array.from({ length: 12 }, (_, i) => i),
  pentatonic: [0, 2, 4, 7, 9],
};

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export default function ImageSonification() {
  const [imageUrl, setImageUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [audioParams, setAudioParams] = useState({
    scale: "major",
    key: "C",
    octave: 4,
    waveform: "sine",
    attack: 0.1,
    decay: 0.3,
    brightness: 0.5,
    sparkle: 0.2,
  });
  const [columnData, setColumnData] = useState([]);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [lineProgress, setLineProgress] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformData, setWaveformData] = useState([]);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [analyzerNode, setAnalyzerNode] = useState(null);

  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const previewRef = useRef(null);
  const sourceRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const startTimeRef = useRef(0);
  const progressRef = useRef(0);
  const animationRef = useRef(null);

  const TARGET_DURATION = 30;

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext ||
      window.webkitAudioContext)();
    return () => {
      if (sourceRef.current) {
        sourceRef.current.stop();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target.result);
      processImage(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const processImage = (url) => {
    setProcessing(true);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const columns = [];

      for (let x = 0; x < canvas.width; x++) {
        let totalHue = 0;
        let totalBrightness = 0;

        for (let y = 0; y < canvas.height; y++) {
          const idx = (y * canvas.width + x) * 4;
          const [r, g, b] = imageData.data.slice(idx, idx + 3);

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          let h = (max + min) / 2;

          if (max !== min) {
            const d = max - min;
            switch (max) {
              case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
              case g:
                h = (b - r) / d + 2;
                break;
              case b:
                h = (r - g) / d + 4;
                break;
            }
            h /= 6;
          }

          totalHue += h;
          totalBrightness += (r + g + b) / 3 / 255;
        }

        columns.push({
          hue: totalHue / canvas.height,
          brightness: totalBrightness / canvas.height,
        });
      }

      setColumnData(columns);
      setProcessing(false);
    };
    img.src = url;
  };

  const midiToFreq = (note) => 440 * Math.pow(2, (note - 69) / 12);
  const quantizeToScale = (value, scale) => {
    const notes = SCALES[scale];
    const maxNote = notes.length - 1;
    const index = Math.round(value * maxNote);
    return notes[Math.min(Math.max(index, 0), maxNote)];
  };

  const playAudio = async () => {
    if (!columnData.length) return;
    setIsGeneratingAudio(true);

    const columnDuration = (TARGET_DURATION * 1000) / columnData.length;

    const offlineContext = new OfflineAudioContext({
      numberOfChannels: 2,
      length: TARGET_DURATION * 44100,
      sampleRate: 44100,
    });

    const masterGain = offlineContext.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(offlineContext.destination);

    const rootNote =
      (audioParams.octave + 1) * 12 + NOTES.indexOf(audioParams.key);

    columnData.forEach((column, index) => {
      const time = index * (columnDuration / 1000);
      const scaleNote = quantizeToScale(column.hue, audioParams.scale);
      const midiNote = rootNote + scaleNote;
      const freq = midiToFreq(midiNote);

      const osc = offlineContext.createOscillator();
      osc.type = audioParams.waveform;

      if (audioParams.sparkle > 0) {
        const fmOsc = offlineContext.createOscillator();
        const fmGain = offlineContext.createGain();
        fmOsc.type = "square";
        fmOsc.frequency.value = freq * 2;
        fmGain.gain.value = freq * audioParams.sparkle;
        fmOsc.connect(fmGain);
        fmGain.connect(osc.frequency);
        fmOsc.start(time);
        fmOsc.stop(time + audioParams.attack + audioParams.decay);
      }

      const gain = offlineContext.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(
        column.brightness * audioParams.brightness,
        time + audioParams.attack
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        time + audioParams.attack + audioParams.decay
      );

      osc.connect(gain);
      gain.connect(masterGain);

      osc.frequency.setValueAtTime(freq, time);
      osc.start(time);
      osc.stop(time + audioParams.attack + audioParams.decay);
    });

    const buffer = await offlineContext.startRendering();
    setAudioBuffer(buffer);
    setAudioBlob(audioBufferToWav(buffer));
    setIsGeneratingAudio(false);
  };

  const visualize = (analyzer) => {
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyzer.getByteTimeDomainData(dataArray);

      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  };

  const audioBufferToWav = (buffer) => {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    const format = 1;

    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    const writeString = (str, offset) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString("RIFF", 0);
    view.setUint32(4, 36 + length * numChannels * bytesPerSample, true);
    writeString("WAVE", 8);
    writeString("fmt ", 12);
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString("data", 36);
    view.setUint32(40, length * numChannels * bytesPerSample, true);

    const data = new Uint16Array(length * numChannels);
    let offset = 0;

    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(
          -1,
          Math.min(1, buffer.getChannelData(channel)[i])
        );
        data[offset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        offset++;
      }
    }

    return new Blob([header, data], { type: "audio/wav" });
  };
  const handleParamChange = (e) => {
    setAudioParams({
      ...audioParams,
      [e.target.name]:
        e.target.type === "number"
          ? parseFloat(e.target.value)
          : e.target.value,
    });
  };

  const handlePlayPause = () => {
    if (!audioBuffer) return;

    if (isPlaying) {
      sourceRef.current?.stop();
      cancelAnimationFrame(animationFrameRef.current);

      cancelAnimationFrame(animationRef.current);
      setIsPlaying(false);
    } else {

      const audioContext = audioContextRef.current;
      const source = audioContext.createBufferSource();
      const analyzer = audioContext.createAnalyser();

      analyzer.fftSize = 2048;
      source.buffer = audioBuffer;

      source.connect(analyzer);
      analyzer.connect(audioContext.destination);

      setAnalyzerNode(analyzer);

      source.connect(audioContextRef.current.destination);

      startTimeRef.current =
        audioContextRef.current.currentTime -
        progressRef.current * TARGET_DURATION;

      startTimeRef.current =
        audioContextRef.current.currentTime -
        progressRef.current * TARGET_DURATION;

      startTimeRef.current =
        audioContext.currentTime - progressRef.current * TARGET_DURATION;
      source.start(0, progressRef.current * TARGET_DURATION);

      sourceRef.current = source;
      setIsPlaying(true);

      const drawProgress = () => {
        const progress =
          (audioContextRef.current.currentTime - startTimeRef.current) /
          TARGET_DURATION;
        progressRef.current = progress;
        setLineProgress(progress * 100);

        if (progress >= 1) {
          setIsPlaying(false);
          progressRef.current = 0;
          setLineProgress(null);
        } else {
          animationFrameRef.current = requestAnimationFrame(drawProgress);
        }
      };

      drawProgress();

      visualize(analyzer);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black">
      {!imageUrl && (
        <FadeContent
          blur={true}
          duration={700}
          easing="ease-out"
          initialOpacity={0}
          className="flex-1 flex text-white justify-center items-center space-x-8"
        >
          <DotPattern
            className={cn(
              "[mask-image:radial-gradient(400px_circle_at_center,white,transparent)]"
            )}
          />
          <div className="flex flex-col justify-start items-start min-w-[400px]">
            <ShinyText
              text="Create Your Own"
              disabled={false}
              speed={3}
              className="text-3xl font-bold"
            />
            <p className="text-sm text-[#c3c3c3] max-w-[300px]">
              Upload your own data and sonify it on the basis of light
              intensity.
            </p>
          </div>
          <label
            htmlFor="imageUpload"
            className="w-96 h-60 flex flex-col justify-center items-center border-2 border-dashed border-[#5d82fe] text-white hover:border-[#252525] transition-all duration-300 cursor-pointer rounded-2xl p-2 overflow-hidden z-20"
          >
            <input
              id="imageUpload"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <span className="w-full h-full flex justify-center flex-col items-center rounded-lg bg-[#262626] hover:bg-[#333333] active:scale-[99%]">
              <Upload className="mb-2" />
              Upload Image
            </span>
          </label>
        </FadeContent>
      )}

      {imageUrl && (
        <div className="flex items-center justify-center flex-1 w-full bg-black h-full">
          <div className="h-full relative w-3/4 flex justify-center items-center">
            <GridPattern
              width={30}
              height={30}
              x={-1}
              y={-1}
              strokeDasharray={"4 2"}
              className={cn(
                "[mask-image:radial-gradient(500px_circle_at_center,white,transparent)]"
              )}
            />
            <div className="relative inline-block p-4">
              <div className="relative flex items-center">
                <img
                  ref={previewRef}
                  src={imageUrl}
                  width={550}
                  height={300}
                  className="max-h-[350px] max-w-[550px] p-2 border-2 border-dashed border-[#171717] bg-[#141414] rounded-lg"
                />
                {lineProgress !== null && (
                  <div
                    style={{ left: `${lineProgress}%` }}
                    className="absolute h-[98%] w-2 backdrop-blur-sm backdrop-brightness-[300%] bg-white/30 shadow-[0px_0px_10px_#ffffff] rounded-full"
                  />
                )}
              </div>
              <canvas
                ref={waveformCanvasRef}
                className="w-full h-24 mt-4"
                width={550}
                height={96}
              />
              <div className="flex gap-4">
                <Button
                  onClick={playAudio}
                  className="bg-white text-black hover:bg-white/90 font-medium py-2 mt-4 w-full"
                  disabled={isGeneratingAudio}
                >
                  {isGeneratingAudio ? "Processing..." : "Generate Audio"}
                </Button>
                {audioBlob && (
                  <div className="flex gap-4 justify-center pt-4 w-full">
                    <Button
                      onClick={handlePlayPause}
                      className="w-full bg-white text-black hover:bg-white/90"
                    >
                      {isPlaying ? "Pause" : "Play"}
                    </Button>
                    <a
                      href={URL.createObjectURL(audioBlob)}
                      download="sonification.wav"
                      className="w-full inline-flex items-center justify-center px-4 py-2 bg-white text-black hover:bg-white/90 rounded-md font-medium"
                    >
                      Download
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center h-full w-1/4">
            <div className="w-full h-full border-l border-white/10 bg-black p-8 pt-24 space-y-3">
              <h2 className="text-2xl font-bold text-white tracking-tight mb-8">
                Sonification Configurations
              </h2>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-white text-sm">Musical Key</Label>
                  <div className="flex gap-2">
                    <Select
                      value={audioParams.key}
                      onValueChange={(v) =>
                        setAudioParams((p) => ({ ...p, key: v }))
                      }
                    >
                      <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-black border-white/10">
                        {NOTES.map((note) => (
                          <SelectItem
                            key={note}
                            value={note}
                            className="hover:bg-white/10"
                          >
                            {note}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={audioParams.octave}
                      onValueChange={(v) =>
                        setAudioParams((p) => ({ ...p, octave: parseInt(v) }))
                      }
                    >
                      <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-black border-white/10">
                        {[3, 4, 5, 6].map((oct) => (
                          <SelectItem
                            key={oct}
                            value={oct}
                            className="hover:bg-white/10"
                          >
                            {oct}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white text-sm">Scale Type</Label>
                  <Select
                    value={audioParams.scale}
                    onValueChange={(v) =>
                      setAudioParams((p) => ({ ...p, scale: v }))
                    }
                  >
                    <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/10">
                      {Object.keys(SCALES).map((scale) => (
                        <SelectItem
                          key={scale}
                          value={scale}
                          className="hover:bg-white/10"
                        >
                          {scale.charAt(0).toUpperCase() + scale.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-white text-sm">Brightness</Label>
                  <Input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={audioParams.brightness}
                    onChange={(e) =>
                      setAudioParams((p) => ({
                        ...p,
                        brightness: e.target.value,
                      }))
                    }
                    className="bg-white/5 border-white/10"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white text-sm">Sparkle Effect</Label>
                  <Input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.05"
                    value={audioParams.sparkle}
                    onChange={(e) =>
                      setAudioParams((p) => ({ ...p, sparkle: e.target.value }))
                    }
                    className="bg-white/5 border-white/10"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white text-sm">Waveform</Label>
                  <Select
                    value={audioParams.waveform}
                    onValueChange={(v) =>
                      setAudioParams((p) => ({ ...p, waveform: v }))
                    }
                  >
                    <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-white/10">
                      {["sine", "square", "sawtooth", "triangle", "bell"].map(
                        (wave) => (
                          <SelectItem
                            key={wave}
                            value={wave}
                            className="hover:bg-white/10"
                          >
                            {wave.charAt(0).toUpperCase() + wave.slice(1)}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-white text-sm">Attack (s)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    name="attack"
                    value={audioParams.attack}
                    onChange={handleParamChange}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white text-sm">Decay (s)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    name="decay"
                    value={audioParams.decay}
                    onChange={handleParamChange}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white text-sm">
                    Column Duration (ms)
                  </Label>
                  <Input
                    type="number"
                    name="columnDuration"
                    value={audioParams.columnDuration}
                    onChange={handleParamChange}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
