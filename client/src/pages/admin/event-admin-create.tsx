// Create event_admin (Phase 2).
//
// Single-call flow: POST /api/events/:eventId/admins creates the
// event_admin user AND assigns them to the event. The password is generated
// server-side (never chosen by the creator), shown ONCE here with a copy
// button and a "never shown again" warning. The account must change it on
// first login.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation } from 'wouter';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { errorToast, successToast } from '@/lib/toast';
import { ArrowLeft, Copy, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import type { Event } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';

const formSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').regex(/^[a-zA-Z0-9_-]+$/, 'Letters, numbers, _ and - only'),
  email: z.string().email('Invalid email address'),
  fullName: z.string().min(2, 'Full name is required'),
  eventId: z.string().min(1, 'Please select an event'),
});

type FormData = z.infer<typeof formSchema>;

interface CreatedAdmin {
  admin: { id: string; username: string; email: string; fullName: string };
  tempPassword: string;
}

export default function EventAdminCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [created, setCreated] = useState<CreatedAdmin | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: events, isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ['/api/events'],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      email: '',
      fullName: '',
      eventId: '',
    },
  });

  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    try {
      const response = await apiRequest('POST', `/api/events/${data.eventId}/admins`, {
        username: data.username,
        email: data.email,
        fullName: data.fullName,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create event admin');
      }
      const result: CreatedAdmin = await response.json();
      setCreated(result);

      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });

      successToast(toast, 'Event admin created', 'Account created and assigned to the event.');
    } catch (error: any) {
      errorToast(toast, 'Creation failed', error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function copyPassword() {
    if (!created) return;
    navigator.clipboard.writeText(created.tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setLocation('/admin/event-admins')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to event admins
        </Button>

        {created ? (
          <Card>
            <CardHeader>
              <CardTitle>Event admin created</CardTitle>
              <CardDescription>
                {created.admin.fullName} ({created.admin.username}) has been assigned to the event.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-amber-500 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">One-time password — save it now</AlertTitle>
                <AlertDescription className="text-amber-700">
                  This password will <strong>never be shown again</strong>. Copy it and
                  share it securely with {created.admin.fullName}. They will be forced
                  to change it on first login.
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded border px-3 py-2 font-mono text-base select-all bg-slate-50">
                  {created.tempPassword}
                </code>
                <Button variant="outline" onClick={copyPassword}>
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <Button className="w-full" onClick={() => setLocation('/admin/event-admins')}>
                Done
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Create event admin</CardTitle>
              <CardDescription>
                Creates the account and assigns it to the selected event in one step.
                A strong random password is generated automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="eventId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an event" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {eventsLoading ? (
                              <SelectItem value="__loading" disabled>Loading…</SelectItem>
                            ) : (
                              events?.map((e) => (
                                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name *</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username *</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl><Input type="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    No password field: a strong random password is generated server-side and shown once after creation.
                  </p>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : 'Create event admin'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
