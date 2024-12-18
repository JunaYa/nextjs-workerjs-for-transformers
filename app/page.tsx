"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MessageTypes, ModelNames } from "@/lib/whisper.utils"
import { Input } from "@/components/ui/input"
import { useRef } from "react"
import Script from 'next/script';

// const ACCEPTED_AUDIO_TYPES = [
//   "audio/mpeg",
//   "audio/wav",
//   "audio/mp4",
//   "audio/mov",
//   "audio/avi",
//   "audio/flv",
//   "audio/wmv",
//   "audio/mpeg",
//   "audio/mpg",
//   "audio/webm",
//   "audio/opus",
// ]

const FormSchema = z.object({
  model: z
    .string({
      required_error: "Please select an email to display.",
    }),
  // file: typeof window === "undefined" ? z.any(): z.instanceof(FileList).transform((fileList) => fileList[0])
  file: z.any()
    // .refine((files) => files?.length == 0, "File is required.")
    // .refine((files) => files?.[0]?.size <= MAX_FILE_SIZE, `Max file size is 5MB.`)
    // .refine(
    //   (files) => ACCEPTED_AUDIO_TYPES.includes(files?.[0]?.type),
    //   ".mp3, .wav, .mp4, .mov, .avi, .flv, .wmv, .mpeg, .mpg, .webm, .opus files are accepted."
    // ),
})

export default function TransformPage() {
  const workerRef = useRef<Worker | null>(null)
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  })

  // useEffect(() => {
  //   workerRef.current = createWorker();
  //   return () => {
  //     if (workerRef.current) {
  //       workerRef.current.terminate();
  //     }
  //   }
  // }, []);

  function createWorker() {
    const worker = new Worker(new URL('./whisper.worker.js', import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent) => {
      const { type } = event.data;
      console.log('worker.onmessage', type);
      if (type === MessageTypes.LOADING) {
        // handleLoadingMessage(event.data);
      }
      if (type === MessageTypes.DOWNLOADING) {
        // LOADING_MESSAGE_CONTAINER.innerHTML = "Downloading model...";
      }
      if (type === MessageTypes.RESULT) {
        // handleResultMessage(event.data);
      }
      if (type === MessageTypes.RESULT_PARTIAL) {
        // handlePartialResultMessage(event.data);
      }
      if (type === MessageTypes.INFERENCE_DONE) {
        // handleInferenceDone(event.data);
      }
    };
    worker.onerror = function(event: ErrorEvent) {
      console.error('whisper.worker.js error:', event); 
    };
    return worker;
  }

  async function startWorker() {
    if (!form.getValues("file") || !form.getValues("model")) {
      return;
    }

    if (!workerRef.current) {
      workerRef.current = createWorker();
    }
  
    const model_name = `${form.getValues("model")}`;
    const file = form.getValues("file");
    const audio = await readAudioFrom(file);

    workerRef.current.postMessage({
      type: MessageTypes.INFERENCE_REQUEST,
      audio,
      model_name,
    });
  }
  
  // async function stopWorker() {
  //   if (workerRef.current) {
  //     workerRef.current.terminate();
  //   }
  // }
  
  async function readAudioFrom(file: File) {
    const sampling_rate = 16000;
    const audioCTX = new AudioContext({ sampleRate: sampling_rate });
    const response = await file.arrayBuffer();
    const decoded = await audioCTX.decodeAudioData(response);
    const audio = decoded.getChannelData(0);
    return audio;
  }

  function onSubmit(data: z.infer<typeof FormSchema>) {
    console.log('onSubmit', data);
    startWorker();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12">
      <Script src="/whisper.worker.js" />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl space-y-6">
        <FormField
            control={form.control}
            name="file"
            render={({ field: { value, onChange, ...fieldProps } }) => (
              <FormItem>
                <FormLabel>File</FormLabel>
                <FormControl>
                  <Input id="audio-file" 
                  type="file"
                  defaultValue={value}
                  {...fieldProps}
                  onChange={(event) =>
                    onChange(event.target.files && event.target.files[0])
                  }
                  placeholder="Select an audio or video file" accept=".mp3,.wav,.mp4,.mov,.avi,.flv,.wmv,.mpeg,.mpg,.webm,.opus" />
                </FormControl>
                <FormDescription>
                  The file will be transcribed and then transformed into a JSON format.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a verified email to display" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ModelNames.map((model_name: string) => (
                      <SelectItem key={model_name} value={model_name}>{model_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Large will be more accurate, but slower. In the models
                  are listed in order of size. The models with .en at the
                  only support English but are slightly more accurate.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Submit</Button>
        </form>
      </Form>
    </main>
  )
}
