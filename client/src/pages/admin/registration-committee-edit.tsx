import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useRoute } from 'wouter';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Eye, EyeOff, User, Mail, Lock, UserCircle } from 'lucide-react';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import type { User as UserType } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';

const editFormSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').or(z.literal('')),
  username: z.string().min(3, 'Username must be at least 3 characters').or(z.literal('')),
  email: z.string().email('Invalid email address').or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters').or(z.literal('')),
});

type FormData = z.infer<typeof editFormSchema>;

export default function RegistrationCommitteeEditPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/admin/registration-committee/:id/edit');
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const userId = params?.id;

  const { data: users, isLoading } = useQuery<UserType[]>({
    queryKey: ['/api/users'],
  });

  const committeeUser = users?.find(user => user.id === userId && user.role === 'registration_committee');

  const form = useForm<FormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      fullName: '',
      username: '',
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (committeeUser) {
      form.reset({
        fullName: committeeUser.fullName,
        username: committeeUser.username,
        email: committeeUser.email,
        password: '',
      });
    }
  }, [committeeUser, form]);

  async function onSubmit(data: FormData) {
    const updates: any = {};
    if (data.fullName?.trim() && data.fullName.trim() !== committeeUser?.fullName) {
      updates.fullName = data.fullName.trim();
    }
    if (data.username?.trim() && data.username.trim() !== committeeUser?.username) {
      updates.username = data.username.trim();
    }
    if (data.email?.trim() && data.email.trim() !== committeeUser?.email) {
      updates.email = data.email.trim();
    }
    if (data.password?.trim()) {
      updates.password = data.password.trim();
    }

    if (Object.keys(updates).length === 0) {
      toast({
        title: 'No changes',
        description: 'Please update at least one field',
        variant: 'destructive',
      });
      return;
    }

    try {
      await apiRequest('PATCH', `/api/users/${userId}/credentials`, updates);
      
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      
      toast({
        title: 'User updated',
        description: 'Registration committee member details have been updated successfully',
      });
      
      navigate('/admin/registration-committee');
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="text-center py-8" data-testid="loading-user">Loading user data...</div>
        </div>
      </AdminLayout>
    );
  }

  if (!committeeUser) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="text-center py-8 text-gray-500" data-testid="user-not-found">
            Registration committee member not found
          </div>
          <div className="text-center">
            <Button onClick={() => navigate('/admin/registration-committee')} data-testid="button-back-to-list">
              Back to Registration Committee
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/registration-committee')}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Registration Committee
          </Button>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-edit-committee">Edit Registration Committee Member</h1>
          <p className="text-gray-600 mt-1">Update details for {committeeUser.fullName}</p>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Member Details</CardTitle>
            <CardDescription>Update the registration committee member's information. Leave fields empty to keep current values.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <UserCircle className="h-4 w-4" />
                        Full Name
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Enter full name" {...field} data-testid="input-fullname" />
                      </FormControl>
                      <FormDescription>
                        Current: {committeeUser.fullName}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Username
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Enter new username" {...field} data-testid="input-username" />
                      </FormControl>
                      <FormDescription>
                        Current: {committeeUser.username}
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
                      <FormLabel className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Enter new email" autoComplete="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormDescription>
                        Current: {committeeUser.email}
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
                      <FormLabel className="flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        Password
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            type={showPassword ? "text" : "password"} 
                            placeholder="Enter new password (leave empty to keep current)" 
                            autoComplete="new-password" 
                            {...field} 
                            data-testid="input-password" 
                          />
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
                        Leave empty to keep the current password
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/admin/registration-committee')}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={form.formState.isSubmitting} 
                    data-testid="button-submit"
                  >
                    {form.formState.isSubmitting ? 'Updating...' : 'Update Member'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
