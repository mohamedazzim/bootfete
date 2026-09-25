import { useParams, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useCallback } from 'react';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertQuestionSchema } from '@shared/schema';
import { z } from 'zod';
import { ArrowLeft, Plus, X, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';

const formSchema = insertQuestionSchema.omit({
  options: true,
  correctAnswer: true,
  expectedOutput: true,
  testCases: true
}).extend({
  questionType: z.enum(['mcq', 'true_false', 'short_answer', 'coding', 'image_mcq', 'fill_blank']),
});

type FormData = z.infer<typeof formSchema>;

export default function QuestionCreatePage() {
  const { roundId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [questionType, setQuestionType] = useState<string>('mcq');
  const [mcqOptions, setMcqOptions] = useState<string[]>(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState<string>('');

  // Image MCQ state
  const [imageOptions, setImageOptions] = useState<{ file: File | null; preview: string; url: string }[]>([
    { file: null, preview: '', url: '' },
    { file: null, preview: '', url: '' },
    { file: null, preview: '', url: '' },
    { file: null, preview: '', url: '' },
  ]);
  const [correctImageIndex, setCorrectImageIndex] = useState<number | null>(null);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  // Compress image for faster upload (5MB -> ~150KB)
  const compressImage = async (file: File, maxWidth = 1200, quality = 0.8): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            const compressedFile = new File([blob!], file.name, { type: 'image/jpeg' });
            URL.revokeObjectURL(img.src);
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      roundId: roundId || '',
      questionType: 'mcq',
      questionText: '',
      questionNumber: 1,
      points: 1,
    },
  });

  async function onSubmit(data: FormData) {
    try {
      const questionData: any = {
        ...data,
        roundId,
      };

      if (questionType === 'mcq') {
        const validOptions = mcqOptions.filter(opt => opt.trim() !== '');
        if (validOptions.length < 2) {
          toast({
            title: 'Invalid options',
            description: 'Please provide at least 2 options for MCQ',
            variant: 'destructive',
          });
          return;
        }
        if (!correctAnswer) {
          toast({
            title: 'Missing correct answer',
            description: 'Please select the correct answer',
            variant: 'destructive',
          });
          return;
        }
        questionData.options = validOptions;
        questionData.correctAnswer = correctAnswer;
      } else if (questionType === 'image_mcq') {
        // Handle Image MCQ
        const uploadedImages = imageOptions.filter(opt => opt.file || opt.url);
        if (uploadedImages.length < 2) {
          toast({
            title: 'Invalid options',
            description: 'Please upload at least 2 images for Image MCQ',
            variant: 'destructive',
          });
          return;
        }
        if (correctImageIndex === null) {
          toast({
            title: 'Missing correct answer',
            description: 'Please select the correct image option',
            variant: 'destructive',
          });
          return;
        }

        // Upload images first
        setIsUploadingImages(true);
        try {
          const filesToUpload = imageOptions.filter(opt => opt.file).map(opt => opt.file as File);
          if (filesToUpload.length > 0) {
            const formData = new FormData();
            filesToUpload.forEach(file => formData.append('images', file));

            const token = localStorage.getItem('token');
            const uploadResponse = await fetch('/api/upload/question-images', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
              body: formData
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              throw new Error(errorData.message || 'Failed to upload images');
            }

            const { urls } = await uploadResponse.json();
            // Update image options with uploaded URLs
            let urlIndex = 0;
            const updatedOptions = imageOptions.map(opt => {
              if (opt.file) {
                return { ...opt, url: urls[urlIndex++] };
              }
              return opt;
            });
            setImageOptions(updatedOptions);

            const validUrls = updatedOptions.filter(opt => opt.url).map(opt => opt.url);
            questionData.options = validUrls;
            questionData.correctAnswer = validUrls[correctImageIndex];
          }
        } finally {
          setIsUploadingImages(false);
        }

        questionData.questionType = 'image_mcq';
      } else if (questionType === 'true_false') {
        questionData.options = ['True', 'False'];
        questionData.correctAnswer = correctAnswer || 'True';
      } else if (questionType === 'short_answer') {
        questionData.correctAnswer = correctAnswer || null;
      } else if (questionType === 'fill_blank') {
        questionData.questionType = 'fill_blank';
        questionData.correctAnswer = correctAnswer || null;
      } else if (questionType === 'coding') {
        questionData.expectedOutput = correctAnswer || null;
      }

      await apiRequest('POST', `/api/rounds/${roundId}/questions`, questionData);

      toast({
        title: 'Question created',
        description: 'The question has been added successfully',
      });

      queryClient.invalidateQueries({ queryKey: ['/api/rounds', roundId, 'questions'] });
      setLocation(`/event-admin/rounds/${roundId}/questions`);
    } catch (error: any) {
      toast({
        title: 'Creation failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  const updateMcqOption = (index: number, value: string) => {
    const newOptions = [...mcqOptions];
    newOptions[index] = value;
    setMcqOptions(newOptions);
  };

  const addMcqOption = () => {
    setMcqOptions([...mcqOptions, '']);
  };

  const removeMcqOption = (index: number) => {
    if (mcqOptions.length > 2) {
      setMcqOptions(mcqOptions.filter((_, i) => i !== index));
    }
  };

  return (
    <EventAdminLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation(`/event-admin/rounds/${roundId}/questions`)}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Questions
          </Button>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-create-question">Create New Question</h1>
          <p className="text-gray-600 mt-1">Add a new question to the round</p>
        </div>

        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Question Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="questionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Question Type</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setQuestionType(value);
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-type">
                            <SelectValue placeholder="Select question type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="mcq">Multiple Choice (MCQ)</SelectItem>
                          <SelectItem value="true_false">True/False</SelectItem>
                          <SelectItem value="fill_blank">Fill in the Blanks</SelectItem>
                          <SelectItem value="short_answer">Short Answer</SelectItem>
                          <SelectItem value="coding">Coding Question</SelectItem>
                          <SelectItem value="image_mcq">Image Question</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="questionNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question Number</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-question-number"
                          />
                        </FormControl>
                        <FormDescription>Sequential question number</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="questionText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Question Text</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter the question..."
                          className="min-h-[120px]"
                          {...field}
                          data-testid="input-question-text"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {questionType === 'mcq' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <FormLabel>Answer Options</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addMcqOption}
                        data-testid="button-add-option"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Option
                      </Button>
                    </div>
                    {mcqOptions.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder={`Option ${index + 1}`}
                          value={option}
                          onChange={(e) => updateMcqOption(index, e.target.value)}
                          data-testid={`input-option-${index}`}
                        />
                        {mcqOptions.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMcqOption(index)}
                            data-testid={`button-remove-option-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <div>
                      <FormLabel>Correct Answer</FormLabel>
                      <Select value={correctAnswer} onValueChange={setCorrectAnswer}>
                        <SelectTrigger data-testid="select-correct-answer">
                          <SelectValue placeholder="Select correct answer" />
                        </SelectTrigger>
                        <SelectContent>
                          {mcqOptions.filter(opt => opt.trim() !== '').map((option, index) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {questionType === 'true_false' && (
                  <div>
                    <FormLabel>Correct Answer</FormLabel>
                    <Select value={correctAnswer || 'True'} onValueChange={setCorrectAnswer}>
                      <SelectTrigger data-testid="select-true-false">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="True">True</SelectItem>
                        <SelectItem value="False">False</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(questionType === 'short_answer' || questionType === 'fill_blank') && (
                  <div>
                    <FormLabel>{questionType === 'fill_blank' ? 'Correct Answer (Exact Match)' : 'Expected Answer (Optional)'}</FormLabel>
                    <FormDescription className="mb-2">
                      {questionType === 'fill_blank'
                        ? 'The exact word or phrase that correctly fills the blank (case-insensitive auto-graded)'
                        : 'Provide a sample answer for reference (manual grading may be required)'}
                    </FormDescription>
                    <Input
                      placeholder={questionType === 'fill_blank' ? 'e.g. inheritance' : 'Expected answer...'}
                      value={correctAnswer}
                      onChange={(e) => setCorrectAnswer(e.target.value)}
                      data-testid="input-expected-answer"
                    />
                  </div>
                )}

                {questionType === 'coding' && (
                  <div>
                    <FormLabel>Expected Output (Optional)</FormLabel>
                    <FormDescription className="mb-2">
                      Describe the expected output or test cases
                    </FormDescription>
                    <Textarea
                      placeholder="Describe expected output or test cases..."
                      value={correctAnswer}
                      onChange={(e) => setCorrectAnswer(e.target.value)}
                      className="min-h-[100px]"
                      data-testid="input-expected-output"
                    />
                  </div>
                )}

                {questionType === 'image_mcq' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <FormLabel>Image Options</FormLabel>
                        <FormDescription>Upload 2-6 images as options. Select one as the correct answer.</FormDescription>
                      </div>
                      {imageOptions.length < 6 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setImageOptions([...imageOptions, { file: null, preview: '', url: '' }])}
                          data-testid="button-add-image-option"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Image
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {imageOptions.map((option, index) => (
                        <div
                          key={index}
                          className={`relative border-2 rounded-lg p-3 ${correctImageIndex === index
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                        >
                          {option.preview ? (
                            <div className="space-y-2">
                              <img
                                src={option.preview}
                                alt={`Option ${index + 1}`}
                                className="w-full h-32 object-contain rounded bg-gray-100"
                              />
                              <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="correctImage"
                                    checked={correctImageIndex === index}
                                    onChange={() => setCorrectImageIndex(index)}
                                    className="h-4 w-4"
                                  />
                                  <span className="text-sm font-medium">Correct</span>
                                </label>
                                {imageOptions.length > 2 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newOptions = imageOptions.filter((_, i) => i !== index);
                                      setImageOptions(newOptions);
                                      if (correctImageIndex === index) {
                                        setCorrectImageIndex(null);
                                      } else if (correctImageIndex !== null && correctImageIndex > index) {
                                        setCorrectImageIndex(correctImageIndex - 1);
                                      }
                                    }}
                                    data-testid={`button-remove-image-${index}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center h-32 cursor-pointer text-gray-500 hover:text-gray-700">
                              <Upload className="h-8 w-8 mb-2" />
                              <span className="text-sm">Option {index + 1}</span>
                              <span className="text-xs">Click to upload</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setIsCompressing(true);
                                    try {
                                      // Compress image for faster upload
                                      const compressedFile = await compressImage(file);
                                      const reader = new FileReader();
                                      reader.onload = (ev) => {
                                        const newOptions = [...imageOptions];
                                        newOptions[index] = {
                                          file: compressedFile,
                                          preview: ev.target?.result as string,
                                          url: ''
                                        };
                                        setImageOptions(newOptions);
                                      };
                                      reader.readAsDataURL(compressedFile);
                                    } finally {
                                      setIsCompressing(false);
                                    }
                                  }
                                }}
                                data-testid={`input-image-${index}`}
                              />
                            </label>
                          )}
                        </div>
                      ))}
                    </div>

                    {correctImageIndex !== null && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <span className="text-sm text-green-800">
                          ✓ Option {correctImageIndex + 1} is marked as the correct answer
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="submit" disabled={isUploadingImages} data-testid="button-create">
                    {isUploadingImages ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Create Question'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation(`/event-admin/rounds/${roundId}/questions`)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </EventAdminLayout>
  );
}
