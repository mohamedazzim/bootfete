import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import { Copy, Plus, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/layouts/AdminLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RegistrationForm, Event } from "@shared/schema";

import { useState } from "react";

export default function RegistrationFormsPage() {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formToDelete, setFormToDelete] = useState<string | null>(null);

  const { data: forms, isLoading } = useQuery<RegistrationForm[]>({
    queryKey: ['/api/registration-forms/all'],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ['/api/events'],
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest('PATCH', `/api/registration-forms/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/registration-forms/all'] });
      toast({
        title: "Updated",
        description: "Form status updated successfully",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/registration-forms/${id}`);
    },
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData(['/api/registration-forms/all'], (oldData: RegistrationForm[] | undefined) => {
        return oldData ? oldData.filter(form => form.id !== deletedId) : [];
      });
      queryClient.invalidateQueries({ queryKey: ['/api/registration-forms/all'] });
      setDeleteDialogOpen(false);
      setFormToDelete(null);
      toast({
        title: "Deleted",
        description: "Registration form deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyLink = (slug: string) => {
    const link = `${window.location.origin}/register/${slug}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link copied",
      description: "Registration form link copied to clipboard",
    });
  };

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 max-w-6xl" data-testid="page-registration-forms">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-registration-forms">Registration Forms</h1>
            <p className="text-muted-foreground">Manage public registration forms for events</p>
          </div>
          {events && events.length > 0 && (
            <Link href="/admin/registration-forms/create">
              <Button data-testid="button-create-form">
                <Plus className="h-4 w-4 mr-2" />
                Create Form
              </Button>
            </Link>
          )}
        </div>

        {isLoading ? (
          <div data-testid="loading-forms">Loading forms...</div>
        ) : forms && forms.length > 0 ? (
          <div className="grid gap-4" data-testid="list-forms">
            {forms.map((form) => (
              <Card key={form.id} data-testid={`card-form-${form.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl" data-testid={`text-form-title-${form.id}`}>
                          {form.title}
                        </CardTitle>
                        <Badge variant={form.isActive ? "default" : "secondary"}>
                          {form.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {form.description && (
                        <CardDescription className="text-base" data-testid={`text-form-description-${form.id}`}>
                          {form.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">Active</label>
                      <Switch
                        checked={form.isActive}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: form.id, isActive: checked })
                        }
                        data-testid={`switch-active-${form.id}`}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-muted-foreground">Form Fields:</span>
                        <p className="mt-1">{form.formFields.length} fields configured</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Created:</span>
                        <p className="mt-1">{new Date(form.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t">
                      <span className="text-sm font-medium text-muted-foreground">Shareable Link:</span>
                      <div className="mt-2 flex flex-col md:flex-row gap-2">
                        <code className="flex-1 bg-muted px-3 py-2 rounded text-sm break-all" data-testid={`text-link-${form.id}`}>
                          {window.location.origin}/register/{form.formSlug}
                        </code>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 md:flex-none"
                            onClick={() => copyLink(form.formSlug)}
                            data-testid={`button-copy-${form.id}`}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </Button>
                          <Link href={`/admin/registration-forms/${form.id}/edit`} className="flex-1 md:flex-none">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              data-testid={`button-edit-${form.id}`}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                          </Link>
                          {!form.isActive && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="flex-1 md:flex-none"
                              onClick={() => deleteMutation.mutate(form.id)}
                              data-testid={`button-delete-${form.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card data-testid="card-no-forms">
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">
                No registration forms created yet.
                {events && events.length > 0 ? (
                  <>
                    {" "}
                    <Link href="/admin/registration-forms/create">
                      <Button variant="link" className="p-0" data-testid="link-create-first">
                        Create your first form
                      </Button>
                    </Link>
                  </>
                ) : (
                  " Create an event first to get started."
                )}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
