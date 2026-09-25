import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useRoute } from 'wouter';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import type { User, Event as SchemaEvent } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Plus, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const editFormSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').or(z.literal('')),
  email: z.string().email('Invalid email address').or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters').or(z.literal('')),
});

type FormData = z.infer<typeof editFormSchema>;

export default function EventAdminEditPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/admin/event-admins/:id/edit');
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const adminId = params?.id;

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  const { data: assignedEvents, isLoading: assignedLoading } = useQuery<SchemaEvent[]>({
    queryKey: [`/api/users/${adminId}/assigned-events`],
    enabled: !!adminId,
  });

  const { data: allEvents } = useQuery<SchemaEvent[]>({
    queryKey: ['/api/events'],
  });


  const admin = users?.find(user => user.id === adminId);

  const form = useForm<FormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (admin) {
      form.reset({
        username: admin.username,
        email: admin.email,
        password: '',
      });
    }
  }, [admin, form]);

  async function onSubmit(data: FormData) {
    const updates: any = {};
    if (data.username?.trim()) updates.username = data.username.trim();
    if (data.email?.trim()) updates.email = data.email.trim();
    if (data.password?.trim()) updates.password = data.password.trim();

    if (Object.keys(updates).length === 0) {
      toast({
        title: 'No changes',
        description: 'Please update at least one field',
        variant: 'destructive',
      });
      return;
    }

    try {
      await apiRequest('PATCH', `/api/users/${adminId}/credentials`, updates);

      queryClient.invalidateQueries({ queryKey: ['/api/users'] });

      toast({
        title: 'Admin updated',
        description: 'Admin credentials have been updated successfully',
      });

      navigate('/admin/event-admins');
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  async function handleRemoveAssignment(eventId: string, eventName: string) {
    try {
      await apiRequest('DELETE', `/api/events/${eventId}/admins/${adminId}`);
      queryClient.invalidateQueries({ queryKey: [`/api/users/${adminId}/assigned-events`] });
      toast({
        title: 'Assignment removed',
        description: `Removed assignment from ${eventName}`,
      });
    } catch (error: any) {
      toast({
        title: 'Removal failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  async function handleAddAssignment(eventId: string) {
    if (!eventId) return;
    try {
      await apiRequest('POST', `/api/events/${eventId}/admins`, { adminId });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${adminId}/assigned-events`] });
      toast({
        title: 'Assignment added',
        description: 'Successfully assigned to event',
      });
    } catch (error: any) {
      toast({
        title: 'Assignment failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  const [selectedEventId, setSelectedEventId] = useState<string>("");


  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="text-center py-8" data-testid="loading-admin">Loading admin data...</div>
        </div>
      </AdminLayout>
    );
  }

  if (!admin) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="text-center py-8 text-gray-500" data-testid="admin-not-found">
            Admin not found
          </div>
          <div className="text-center">
            <Button onClick={() => navigate('/admin/event-admins')} data-testid="button-back-to-list">
              Back to Event Admins
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/event-admins')}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Event Admins
          </Button>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-edit-admin">Edit Event Admin</h1>
          <p className="text-gray-600 mt-1">Update credentials for {admin.fullName}</p>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Admin Credentials</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter new username (optional)" {...field} data-testid="input-username" />
                      </FormControl>
                      <FormDescription>
                        Leave empty to keep current username
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Enter new email (optional)" autoComplete="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormDescription>
                        Leave empty to keep current email
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type={showPassword ? "text" : "password"} placeholder="Enter new password (optional)" autoComplete="new-password" {...field} data-testid="input-password" />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Leave empty to keep current password
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/admin/event-admins')}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={form.formState.isSubmitting}
                    data-testid="button-submit"
                  >
                    {form.formState.isSubmitting ? 'Updating...' : 'Update Admin'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="max-w-2xl mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Assigned Events</CardTitle>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Assign Event
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Assign to Event</AlertDialogTitle>
                  <AlertDialogDescription>
                    Select an event to assign this admin to.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an event" />
                    </SelectTrigger>
                    <SelectContent>
                      {allEvents?.filter(e => !assignedEvents?.find(ae => ae.id === e.id)).map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setSelectedEventId("")}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    handleAddAssignment(selectedEventId);
                    setSelectedEventId("");
                  }}>
                    Assign
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardHeader>
          <CardContent>
            {assignedLoading ? (
              <div className="text-center py-4">Loading assigned events...</div>
            ) : !assignedEvents || assignedEvents.length === 0 ? (
              <div className="text-center py-4 text-gray-500">No events assigned</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.name}</TableCell>
                      <TableCell className="capitalize">{event.category.replace('_', ' ')}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive/90">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Assignment?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove {admin.fullName} from {event.name}? They will no longer have access to manage this event.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRemoveAssignment(event.id, event.name)} className="bg-destructive text-destructive-foreground">
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
