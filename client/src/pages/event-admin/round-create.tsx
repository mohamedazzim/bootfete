import { useParams, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { errorToast, successToast } from '@/lib/toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertRoundSchema, ROUND_TYPES } from '@shared/schema';
import { z } from 'zod';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const formSchema = insertRoundSchema.extend({
  startTime: z.string().optional(),
  isManual: z.boolean().default(false),
  conductMedium: z.enum(['online', 'physical']).default('online'),
  roundType: z.enum(['prelims', 'finals']).default('prelims'),
});

type FormData = z.infer<typeof formSchema>;

export default function RoundCreatePage() {
  const { eventId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isEventAdmin = user?.role === 'event_admin';

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      eventId: eventId || '',
      name: '',
      description: '',
      roundNumber: 1,
      duration: 60,
      status: 'not_started',
      startTime: '',
      isManual: false,
      conductMedium: 'online',
      roundType: 'prelims',
    },
  });

  const startTime = form.watch('startTime');
  const duration = form.watch('duration');
  const conductMedium = form.watch('conductMedium');
  const isManual = conductMedium === 'physical';
  const roundNumber = form.watch('roundNumber');
  const roundType = form.watch('roundType');



  const calculatedEndTime = useMemo(() => {
    if (!startTime || !duration) return null;
    const start = new Date(startTime);
    if (isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + duration * 60 * 1000);
    return end.toLocaleString();
  }, [startTime, duration]);

  async function onSubmit(data: FormData) {
    try {
      let start: Date | null = null;
      let end: Date | null = null;

      if (data.startTime) {
        start = new Date(data.startTime);
        end = new Date(start.getTime() + data.duration * 60 * 1000);
      }

      const roundData = {
        ...data,
        eventId,
        startTime: start ? start.toISOString() : undefined,
        endTime: end ? end.toISOString() : undefined,
      };

      await apiRequest('POST', `/api/events/${eventId}/rounds`, roundData);

            successToast(
        toast,
        'Round created',
        'The round has been created successfully',
      );

      queryClient.invalidateQueries({ queryKey: ['/api/events', eventId, 'rounds'] });
      setLocation(`/event-admin/events/${eventId}/rounds`);
    } catch (error: any) {
            errorToast(
        toast,
        'Creation failed',
        error.message,
      );
    }
  }

  return (
    <EventAdminLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation(`/event-admin/events/${eventId}/rounds`)}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Rounds
          </Button>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-create-round">Create New Round</h1>
          <p className="text-gray-600 mt-1">Add a new round to the event</p>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Round Details</CardTitle>
            {isEventAdmin && (
              <Alert className="mb-4 bg-yellow-50 border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-yellow-800">Restricted Access</AlertTitle>
                <AlertDescription className="text-yellow-700">
                  As an Event Admin, you can only create the round. Time schedule and status must be managed by a Super Admin.
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Round Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Preliminary Round, Final Round" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe this round..."
                          className="min-h-[100px]"
                          {...field}
                          value={field.value || ''}
                          data-testid="input-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="conductMedium"
                  render={({ field }) => (
                    <FormItem className="space-y-3 rounded-lg border p-4">
                      <FormLabel className="text-base">Conduct Medium</FormLabel>
                      <FormDescription>
                        Select how this round will be conducted.
                      </FormDescription>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(val) => {
                            field.onChange(val);
                            form.setValue('isManual', val === 'physical');
                          }}
                          defaultValue={field.value}
                          value={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="online" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Online Test
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="physical" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Physical/Manual Round
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="my-6">
                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
                    <FormField
                      control={form.control}
                      name="roundType"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel className="text-base font-semibold">Test Type</FormLabel>
                          <FormDescription>
                            Choose the type of round. This determines what kind of email notifications are sent when results are published.
                          </FormDescription>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                              className="flex flex-col space-y-2 mt-2"
                            >
                              <FormItem className="flex items-start space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="prelims" />
                                </FormControl>
                                <div>
                                  <FormLabel className="font-medium">Prelims / Qualifier</FormLabel>
                                  <div className="text-xs text-muted-foreground">
                                    Qualifiers will receive "Qualified for next round" emails with venue & time
                                  </div>
                                </div>
                              </FormItem>
                              <FormItem className="flex items-start space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="finals" />
                                </FormControl>
                                <div>
                                  <FormLabel className="font-medium">Finals</FormLabel>
                                  <div className="text-xs text-muted-foreground">
                                    Winners will receive "Winner announcement" emails with prize collection details
                                  </div>
                                </div>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="roundNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Round Number</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-round-number"
                          />
                        </FormControl>
                        <FormDescription>Sequential round number</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />



                  {!isManual && (
                    <FormField
                      control={form.control}
                      name="duration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duration (minutes)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                              data-testid="input-duration"
                              disabled={isEventAdmin}
                            />
                          </FormControl>
                          <FormDescription>Test duration</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status" disabled={isEventAdmin}>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="not_started">Not Started</SelectItem>
                          <SelectItem value="in_progress">In progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isManual && (
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            {...field}
                            data-testid="input-start-time"
                            disabled={isEventAdmin}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {calculatedEndTime && (
                  <div className="rounded-md bg-muted p-4" data-testid="text-calculated-end-time">
                    <p className="text-sm font-medium">Calculated End Time</p>
                    <p className="text-sm text-muted-foreground">{calculatedEndTime}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="submit" data-testid="button-create">
                    Create Round
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation(`/event-admin/events/${eventId}/rounds`)}
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
