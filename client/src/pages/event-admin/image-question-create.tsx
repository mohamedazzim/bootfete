import { useParams, useLocation } from 'wouter';
import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, Image, Loader2, Save } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';

export default function ImageQuestionCreatePage() {
    const { roundId } = useParams();
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

    const [expectedAnswer, setExpectedAnswer] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    // Get round info
    const { data: round } = useQuery({
        queryKey: [`/api/rounds/${roundId}`],
        enabled: !!roundId,
    });

    // Get existing questions to determine next question number
    const { data: existingQuestions } = useQuery<any[]>({
        queryKey: [`/api/rounds/${roundId}/questions`],
        enabled: !!roundId,
    });

    const nextQuestionNumber = (existingQuestions?.length || 0) + 1;

    // Handle image file selection
    const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setImagePreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    }, []);

    // Handle drag and drop
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setImagePreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    // Upload image mutation
    const uploadImage = async () => {
        if (!imageFile) throw new Error('No image selected');

        const formData = new FormData();
        formData.append('image', imageFile);

        const token = localStorage.getItem('token');
        const response = await fetch('/api/upload/question-image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            // Try to extract error message from server response
            try {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to upload image');
            } catch (parseError) {
                throw new Error('Failed to upload image');
            }
        }

        return response.json();
    };

    // Create question mutation
    const createQuestionMutation = useMutation({
        mutationFn: async (imageUrl: string) => {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/rounds/${roundId}/questions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    questionType: 'image_text',
                    questionText: imageUrl, // Store image URL in questionText
                    questionNumber: nextQuestionNumber,
                    points: 1,
                    correctAnswer: expectedAnswer || null,
                    options: null,
                    expectedOutput: expectedAnswer || null,
                    testCases: null
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create question');
            }

            return response.json();
        },
        onSuccess: () => {
            toast({ title: 'Success', description: 'Image question created successfully!' });
            queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/questions`] });
            setLocation(`/event-admin/rounds/${roundId}/questions`);
        },
        onError: (error: any) => {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    });

    // Handle form submit
    const handleSubmit = async () => {
        if (!imageFile && !uploadedImageUrl) {
            toast({ title: 'Error', description: 'Please upload an image first', variant: 'destructive' });
            return;
        }

        try {
            setIsUploading(true);

            let imageUrl = uploadedImageUrl;

            // Upload image if not already uploaded
            if (!imageUrl && imageFile) {
                const result = await uploadImage();
                imageUrl = result.url;
                setUploadedImageUrl(imageUrl);
            }

            if (imageUrl) {
                createQuestionMutation.mutate(imageUrl);
            }
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'Failed to upload image', variant: 'destructive' });
        } finally {
            setIsUploading(false);
        }
    };

    const isLoading = isUploading || createQuestionMutation.isPending;

    return (
        <EventAdminLayout>
            <div className="container mx-auto p-6 max-w-3xl">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" size="icon" onClick={() => setLocation(`/event-admin/rounds/${roundId}/questions`)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">Add Image Question</h1>
                        <p className="text-muted-foreground">Question #{nextQuestionNumber} • {(round as any)?.name || 'Round'}</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Image className="h-5 w-5" />
                            Upload Question Image
                        </CardTitle>
                        <CardDescription>
                            Upload an image that participants will see. They will type their answer in a text box.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Image Upload Area */}
                        <div
                            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${imagePreview ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                                }`}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                        >
                            {imagePreview ? (
                                <div className="space-y-4">
                                    <img
                                        src={imagePreview}
                                        alt="Question preview"
                                        className="max-h-64 mx-auto rounded-lg shadow-md"
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setImageFile(null);
                                            setImagePreview(null);
                                            setUploadedImageUrl(null);
                                        }}
                                    >
                                        Remove & Choose Another
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                                        <Upload className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <p className="text-lg font-medium">Drag and drop your image here</p>
                                        <p className="text-sm text-muted-foreground">or click to browse</p>
                                    </div>
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                        className="max-w-xs mx-auto cursor-pointer"
                                    />
                                </div>
                            )}
                        </div>



                        {/* Expected Answer (Admin Reference) */}
                        <div className="space-y-2">
                            <Label htmlFor="expectedAnswer">Expected Answer (Admin Reference Only)</Label>
                            <Textarea
                                id="expectedAnswer"
                                value={expectedAnswer}
                                onChange={(e) => setExpectedAnswer(e.target.value)}
                                placeholder="Enter the expected answer for your reference during evaluation..."
                                className="min-h-[80px]"
                            />
                            <p className="text-xs text-muted-foreground">
                                This will be shown to you during manual evaluation for reference.
                            </p>
                        </div>

                        {/* Submit Button */}
                        <div className="flex gap-3 pt-4">
                            <Button
                                variant="outline"
                                onClick={() => setLocation(`/event-admin/rounds/${roundId}/questions`)}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={!imageFile || isLoading}
                                className="flex-1"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {isUploading ? 'Uploading...' : 'Creating...'}
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Create Image Question
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </EventAdminLayout>
    );
}
