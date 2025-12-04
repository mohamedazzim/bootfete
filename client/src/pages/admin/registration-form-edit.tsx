import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation, useRoute } from "wouter";
import { Plus, Trash2, ArrowLeft, Upload, X, Image } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/layouts/AdminLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { nanoid } from "nanoid";
import type { Event, RegistrationForm } from "@shared/schema";

interface FormField {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number';
  required: boolean;
  placeholder?: string;
}

export default function RegistrationFormEditPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/admin/registration-forms/:id/edit');
  const formId = params?.id;
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: form, isLoading } = useQuery<RegistrationForm>({
    queryKey: ['/api/registration-forms', formId, 'details'],
    enabled: !!formId,
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ['/api/events'],
  });

  useEffect(() => {
    if (form) {
      setTitle(form.title);
      setDescription(form.description || "");
      setHeaderImage(form.headerImage || null);
      setFormFields(form.formFields || []);
    }
  }, [form]);

  const updateFormMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('PATCH', `/api/registration-forms/${formId}`, { 
        title, 
        description, 
        headerImage,
        formFields 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/registration-forms/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/registration-forms', formId, 'details'] });
      toast({
        title: "Success",
        description: "Registration form updated successfully",
      });
      setLocation('/admin/registration-forms');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Image size must be less than 5MB",
          variant: "destructive",
        });
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setHeaderImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setHeaderImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addField = () => {
    setFormFields([...formFields, {
      id: nanoid(),
      label: '',
      type: 'text',
      required: false,
      placeholder: ''
    }]);
  };

  const removeField = (id: string) => {
    setFormFields(formFields.filter(f => f.id !== id));
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFormFields(formFields.map(f => 
      f.id === id ? { ...f, ...updates } : f
    ));
  };

  const handleUpdate = () => {
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a form title",
        variant: "destructive",
      });
      return;
    }

    if (formFields.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one field",
        variant: "destructive",
      });
      return;
    }

    const hasEmptyLabels = formFields.some(f => !f.label.trim());
    if (hasEmptyLabels) {
      toast({
        title: "Error",
        description: "All fields must have a label",
        variant: "destructive",
      });
      return;
    }

    updateFormMutation.mutate();
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="container mx-auto p-6 max-w-6xl">
          <div className="text-center" data-testid="loading-form">Loading form...</div>
        </div>
      </AdminLayout>
    );
  }

  if (!form) {
    return (
      <AdminLayout>
        <div className="container mx-auto p-6 max-w-6xl">
          <div className="text-center text-red-600">Form not found</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 max-w-6xl" data-testid="page-edit-form">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation('/admin/registration-forms')}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Forms
          </Button>
          <h1 className="text-3xl font-bold mb-2" data-testid="heading-edit-form">Edit Registration Form</h1>
          <p className="text-muted-foreground">Update the registration form settings and fields</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Form Details</CardTitle>
                <CardDescription>Update the title and description for your registration form</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Form Title *</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., 2025 Symposium Registration"
                    className="text-lg"
                    data-testid="input-title"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Description (Optional)</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide additional information about the registration process..."
                    className="min-h-[80px]"
                    data-testid="input-description"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Header Image (Optional)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    data-testid="input-header-image"
                  />
                  {headerImage ? (
                    <div className="relative">
                      <img 
                        src={headerImage} 
                        alt="Header preview" 
                        className="w-full max-h-48 object-cover rounded-md border"
                        data-testid="preview-header-image"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={removeImage}
                        data-testid="button-remove-image"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-dashed border-2 h-24 flex flex-col gap-2"
                      data-testid="button-upload-image"
                    >
                      <Upload className="h-6 w-6" />
                      <span>Click to upload header image</span>
                      <span className="text-xs text-muted-foreground">Max 5MB, JPG/PNG/GIF</span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Form Fields</CardTitle>
                <CardDescription>Manage fields for collecting participant information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {formFields.map((field, index) => (
                  <Card key={field.id} className="border-2" data-testid={`field-card-${field.id}`}>
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 space-y-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Field Label *</label>
                            <Input
                              value={field.label}
                              onChange={(e) => updateField(field.id, { label: e.target.value })}
                              placeholder="e.g., Full Name"
                              data-testid={`input-label-${field.id}`}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Field Type</label>
                              <Select 
                                value={field.type} 
                                onValueChange={(value: any) => updateField(field.id, { type: value })}
                              >
                                <SelectTrigger data-testid={`select-type-${field.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="email">Email</SelectItem>
                                  <SelectItem value="tel">Phone</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Placeholder (Optional)</label>
                              <Input
                                value={field.placeholder || ''}
                                onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                                placeholder="Enter placeholder..."
                                data-testid={`input-placeholder-${field.id}`}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`required-${field.id}`}
                              checked={field.required}
                              onCheckedChange={(checked) => updateField(field.id, { required: !!checked })}
                              data-testid={`checkbox-required-${field.id}`}
                            />
                            <label 
                              htmlFor={`required-${field.id}`}
                              className="text-sm font-medium cursor-pointer"
                            >
                              Required field
                            </label>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeField(field.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          data-testid={`button-delete-${field.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Button
                  onClick={addField}
                  variant="outline"
                  className="w-full border-dashed border-2"
                  data-testid="button-add-field"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Field
                </Button>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                onClick={handleUpdate}
                disabled={updateFormMutation.isPending}
                className="flex-1"
                data-testid="button-update"
              >
                {updateFormMutation.isPending ? 'Updating...' : 'Update Registration Form'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/admin/registration-forms')}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <Card>
                <CardHeader className="bg-blue-50 dark:bg-blue-950">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    Live Preview
                  </CardTitle>
                  <CardDescription>How participants will see the form</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6 min-h-[400px]">
                  {headerImage && (
                    <div className="mb-4 -mx-6 -mt-6">
                      <img 
                        src={headerImage} 
                        alt="Header" 
                        className="w-full h-32 object-cover"
                        data-testid="preview-header"
                      />
                    </div>
                  )}
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h3 className="text-xl font-semibold" data-testid="preview-title">
                      {title || 'Form Title Will Appear Here'}
                    </h3>
                    {description && (
                      <p className="text-sm text-muted-foreground mt-2" data-testid="preview-description">
                        {description}
                      </p>
                    )}
                    {!description && (
                      <p className="text-sm text-muted-foreground mt-2 italic">
                        Add a description to show here
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 pt-4">
                    {formFields.length > 0 ? (
                      formFields.map((field) => (
                        <div key={field.id} className="space-y-1" data-testid={`preview-field-${field.id}`}>
                          <label className="text-sm font-medium block">
                            {field.label || 'Field Label'} {field.required && <span className="text-destructive">*</span>}
                          </label>
                          <Input
                            type={field.type}
                            placeholder={field.placeholder || `Enter ${field.label || 'value'}...`}
                            disabled
                            className="bg-muted/50 border-2"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm italic">No fields added yet</p>
                        <p className="text-xs mt-1">Click "Add Field" to start building your form</p>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Image className="h-3 w-3" />
                      Live preview. Changes appear instantly.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
