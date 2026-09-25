import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Plus, Trash2, Users, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RegistrationForm, Event } from "@shared/schema";
import { PAPER_PRESENTATION_TOPICS, FOOD_TYPES, DEPARTMENT_OPTIONS, type FoodType } from "@shared/schema";

interface EventWithRounds extends Event {
    rounds?: Array<{ startTime: Date | string | null; endTime: Date | string | null }>;
}

interface TeamMember {
    rollNo: string;
    name: string;
    email: string;
    dept: string;
    deptIsOther?: boolean; // Track if "Others" was selected for department
    phone: string;
    foodType: FoodType;
    foodTypeLocked?: boolean; // Track if food type is locked from participant registry
}

interface DynamicFormFieldProps {
    field: {
        id: string;
        label: string;
        type: string;
        required: boolean;
        placeholder?: string;
        options?: string[];
    };
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    colleges: string[];
}

function DynamicFormField({ field, value, onChange, onBlur, colleges }: DynamicFormFieldProps) {
    const [isManualEntry, setIsManualEntry] = useState(false);
    const [open, setOpen] = useState(false);
    const label = field.label.toLowerCase();
    const isCollegeField = (label.includes('college') || label.includes('institution')) &&
        !label.includes('roll') &&
        !label.includes('no') &&
        !label.includes('number') &&
        !label.includes('id');
    const isRollNoField = label.includes('roll') || label.includes('register number');
    const isDeptField = (label.includes('dept') || label.includes('department')) &&
        !label.includes('id') &&
        !label.includes('code');

    // Initialize manual entry state if value is present but not in the list
    useEffect(() => {
        if (isCollegeField && value && colleges.length > 0 && !colleges.includes(value)) {
            setIsManualEntry(true);
        }
        // For department field, check if value is not in DEPARTMENT_OPTIONS (excluding "Others")
        if (isDeptField && value && !DEPARTMENT_OPTIONS.slice(0, -1).includes(value as any)) {
            setIsManualEntry(true);
        }
    }, [value, colleges, isCollegeField, isDeptField]);

    // Department field with dropdown
    if (isDeptField) {
        // Determine the select value - show "Others" if manual entry, otherwise show the value or empty
        const selectValue = isManualEntry ? "Others" : (value && DEPARTMENT_OPTIONS.slice(0, -1).includes(value as any) ? value : "");

        return (
            <div className="space-y-2">
                <Label htmlFor={field.id}>
                    {field.label} {field.required && <span className="text-destructive">*</span>}
                </Label>
                <div className="flex flex-col gap-2">
                    <Select
                        value={selectValue || undefined}
                        onValueChange={(val) => {
                            if (val === "Others") {
                                setIsManualEntry(true);
                                onChange(""); // Clear to allow manual entry
                            } else {
                                setIsManualEntry(false);
                                onChange(val);
                            }
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select department..." />
                        </SelectTrigger>
                        <SelectContent>
                            {DEPARTMENT_OPTIONS.map((dept) => (
                                <SelectItem key={dept} value={dept}>
                                    {dept}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {isManualEntry && (
                        <Input
                            className="mt-1"
                            placeholder="Enter your department"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            required={field.required}
                            autoFocus
                        />
                    )}
                </div>
            </div>
        );
    }

    if (isCollegeField) {
        return (
            <div className="space-y-2">
                <Label htmlFor={field.id}>
                    {field.label} {field.required && <span className="text-destructive">*</span>}
                </Label>
                <div className="flex flex-col gap-2">
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={open}
                                className="w-full justify-between font-normal"
                            >
                                {isManualEntry ? "Other (Enter below)" : (value || "Select college...")}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search college..." />
                                <CommandEmpty>No college found.</CommandEmpty>
                                <CommandGroup className="max-h-64 overflow-auto">
                                    {colleges.map((college) => (
                                        <CommandItem
                                            key={college}
                                            value={college}
                                            onSelect={() => {
                                                setIsManualEntry(false);
                                                onChange(college);
                                                setOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    value === college ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {college}
                                        </CommandItem>
                                    ))}
                                    <CommandItem
                                        value="Other"
                                        onSelect={() => {
                                            setIsManualEntry(true);
                                            onChange(""); // Clear value to allow typing
                                            setOpen(false);
                                        }}
                                    >
                                        <Check className={cn("mr-2 h-4 w-4", isManualEntry ? "opacity-100" : "opacity-0")} />
                                        Other
                                    </CommandItem>
                                </CommandGroup>
                            </Command>
                        </PopoverContent>
                    </Popover>

                    {isManualEntry && (
                        <Input
                            className="mt-1"
                            placeholder="Enter your college name"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            required={field.required}
                            autoFocus
                        />
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <Label htmlFor={field.id}>
                {field.label} {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Input
                id={field.id}
                type={field.type}
                placeholder={field.placeholder || ''}
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={isRollNoField ? onBlur : undefined}
                required={field.required}
            />
        </div>
    );
}

export default function PublicRegistrationFormPage() {
    const { toast } = useToast();
    const [, params] = useRoute("/register/:slug");
    const slug = params?.slug || "";
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [selectedTech, setSelectedTech] = useState<string | null>(null);
    const [selectedNonTech, setSelectedNonTech] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
    const [batchResults, setBatchResults] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New state for organizer food type and paper topics
    const [organizerFoodType, setOrganizerFoodType] = useState<FoodType>('veg');
    const [organizerFoodTypeLocked, setOrganizerFoodTypeLocked] = useState(false);
    const [paperTopics, setPaperTopics] = useState<Record<string, string>>({});

    // College list state
    const [colleges, setColleges] = useState<string[]>([]);

    useEffect(() => {
        fetch('/api/colleges')
            .then(res => res.json())
            .then(data => setColleges(data))
            .catch(err => console.error("Failed to fetch colleges:", err));
    }, []);

    // Lookup participant by roll number to pre-fill food type
    const lookupParticipantFoodType = async (rollNo: string): Promise<{ found: boolean; foodType?: FoodType }> => {
        if (!rollNo || rollNo.trim().length === 0) return { found: false };
        try {
            const res = await fetch(`/api/participants/by-roll/${encodeURIComponent(rollNo.trim())}`);
            if (res.ok) {
                const data = await res.json();
                if (data.found && data.participant) {
                    return { found: true, foodType: data.participant.foodType as FoodType };
                }
            }
            return { found: false };
        } catch (err) {
            console.error("Error looking up participant:", err);
            return { found: false };
        }
    };

    // Handle organizer roll number blur - lookup food preference
    const handleOrganizerRollNoBlur = async () => {
        const rollNoField = form?.formFields.find(f =>
            f.label.toLowerCase().includes('roll') ||
            f.id.toLowerCase().includes('roll') ||
            f.label.toLowerCase().includes('register number')
        );
        if (!rollNoField) return;

        const rollNo = formData[rollNoField.id];
        if (!rollNo) return;

        const result = await lookupParticipantFoodType(rollNo);
        if (result.found && result.foodType) {
            setOrganizerFoodType(result.foodType);
            setOrganizerFoodTypeLocked(true);
            toast({
                title: "Food preference loaded",
                description: `Your food preference (${result.foodType === 'veg' ? 'Vegetarian' : 'Non-Vegetarian'}) was loaded from your previous registration.`,
            });
        } else {
            setOrganizerFoodTypeLocked(false);
        }
    };

    // Helper to check if event is Paper Presentation
    const isPaperPresentation = (eventName: string) => {
        const normalized = eventName.toLowerCase();
        return normalized.includes('paper presentation') || normalized.includes('quanta talks');
    };

    const { data: form, isLoading: isLoadingForm } = useQuery<RegistrationForm>({
        queryKey: [`/api/registration-forms/${slug}`],
        enabled: !!slug,
    });

    const { data: events, isLoading: isLoadingEvents } = useQuery<EventWithRounds[]>({
        queryKey: ['/api/events/for-registration'],
        enabled: !!form && form.isActive,
    });

    const technicalEvents = events?.filter(e => e.category === 'technical') || [];
    const nonTechnicalEvents = events?.filter(e => e.category === 'non_technical') || [];

    const formatEventTime = (event: EventWithRounds): string => {
        if (!event.rounds || event.rounds.length === 0) {
            if (event.startDate) {
                const startDate = new Date(event.startDate);
                if (event.endDate) {
                    const endDate = new Date(event.endDate);
                    return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                }
                return startDate.toLocaleDateString();
            }
            return 'Time TBA';
        }

        const firstRound = event.rounds[0];
        if (!firstRound.startTime || !firstRound.endTime) return 'Time TBA';
        const startDate = new Date(firstRound.startTime);
        const endDate = new Date(firstRound.endTime);
        return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const validatePhone = (phone: string) => /^[6-9]\d{9}$/.test(phone.replace(/[\s\-\(\)]/g, ''));

    // Heuristic to map dynamic form fields to required API fields
    const getMappedField = (keyword: string): string | undefined => {
        if (!form) return undefined;
        const field = form.formFields.find(f =>
            f.label.toLowerCase().includes(keyword.toLowerCase()) ||
            f.id.toLowerCase().includes(keyword.toLowerCase())
        );
        return field ? formData[field.id] : undefined;
    };

    const handleAddTeamMember = (eventId: string) => {
        setTeamMembers(prev => ({
            ...prev,
            [eventId]: [...(prev[eventId] || []), { rollNo: '', name: '', email: '', dept: '', deptIsOther: false, phone: '', foodType: 'veg' as FoodType, foodTypeLocked: false }]
        }));
    };

    const handleRemoveTeamMember = (eventId: string, index: number) => {
        setTeamMembers(prev => ({
            ...prev,
            [eventId]: (prev[eventId] || []).filter((_, i) => i !== index)
        }));
    };

    const handleTeamMemberChange = (eventId: string, index: number, field: keyof TeamMember, value: string | boolean) => {
        setTeamMembers(prev => {
            const members = [...(prev[eventId] || [])];
            // Handle deptIsOther as boolean
            if (field === 'deptIsOther') {
                members[index] = { ...members[index], [field]: value === 'true' || value === true };
            } else {
                members[index] = { ...members[index], [field]: value };
            }
            return { ...prev, [eventId]: members };
        });
    };

    // Handle team member roll number blur - lookup food preference
    const handleTeamMemberRollNoBlur = async (eventId: string, index: number) => {
        const members = teamMembers[eventId];
        if (!members || !members[index]) return;

        const rollNo = members[index].rollNo;
        if (!rollNo) return;

        const result = await lookupParticipantFoodType(rollNo);
        if (result.found && result.foodType) {
            setTeamMembers(prev => {
                const updatedMembers = [...(prev[eventId] || [])];
                updatedMembers[index] = {
                    ...updatedMembers[index],
                    foodType: result.foodType!,
                    foodTypeLocked: true
                };
                return { ...prev, [eventId]: updatedMembers };
            });
        } else {
            // Unlock food type if not found
            setTeamMembers(prev => {
                const updatedMembers = [...(prev[eventId] || [])];
                updatedMembers[index] = {
                    ...updatedMembers[index],
                    foodTypeLocked: false
                };
                return { ...prev, [eventId]: updatedMembers };
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;

        // 1. Validate Personal Info (Dynamic Fields)
        const errors: string[] = [];
        form.formFields.forEach((field) => {
            const value = formData[field.id]?.trim();
            if (field.required && !value) errors.push(`${field.label} is required`);
            if (value && field.type === 'email' && !validateEmail(value)) errors.push(`Invalid email for ${field.label}`);
            if (value && field.type === 'tel' && !validatePhone(value)) errors.push(`Invalid phone for ${field.label}`);
        });

        const selectedEventIds = [selectedTech, selectedNonTech].filter(Boolean) as string[];
        if (selectedEventIds.length === 0) errors.push("Please select at least one event");

        // 2. Map fields to Organizer details
        const organizerRollNo = getMappedField('roll') || getMappedField('register number');
        const organizerName = getMappedField('name');
        const organizerEmail = getMappedField('email');
        const organizerDept = getMappedField('dept') || getMappedField('department');
        const organizerPhone = getMappedField('phone') || getMappedField('mobile');
        const organizerCollege = getMappedField('college') || getMappedField('institution');

        if (!organizerRollNo || !organizerName || !organizerEmail || !organizerDept || !organizerPhone) {
            errors.push("Could not identify required student details (Name, Roll No, Email, Dept, Phone) from the form. Please ensure these fields are filled.");
        }

        // 3. Validate Team Members and Paper Topics
        selectedEventIds.forEach(eventId => {
            const event = events?.find(e => e.id === eventId);
            if (event) {
                const members = teamMembers[eventId] || [];
                const totalSize = 1 + members.length; // Organizer + Members
                if (totalSize < event.minMembers) {
                    errors.push(`${event.name}: Minimum team size is ${event.minMembers}. Please add ${event.minMembers - totalSize} more member(s).`);
                }
                if (totalSize > event.maxMembers) {
                    errors.push(`${event.name}: Maximum team size is ${event.maxMembers}. Please remove ${totalSize - event.maxMembers} member(s).`);
                }
                // Validate member fields
                members.forEach((m, idx) => {
                    if (!m.rollNo || !m.name || !m.email || !m.dept || !m.phone) {
                        errors.push(`${event.name}: Please fill all details for Team Member ${idx + 1}`);
                    }
                });
                // Validate paper topic for Paper Presentation events
                if (isPaperPresentation(event.name) && !paperTopics[eventId]) {
                    errors.push(`${event.name}: Please select a paper topic`);
                }
            }
        });

        if (errors.length > 0) {
            toast({ title: "Validation Error", description: errors.join(", "), variant: "destructive" });
            return;
        }

        setIsSubmitting(true);

        try {
            // 4. Submit all events in batch
            const registrations = selectedEventIds.map(eventId => {
                const event = events?.find(e => e.id === eventId);
                if (!event) return null;

                const members = teamMembers[eventId] || [];
                const registrationType = (event.minMembers > 1 || members.length > 0) ? 'team' : 'solo';

                return {
                    eventId,
                    organizerRollNo,
                    organizerName,
                    organizerEmail,
                    organizerDept,
                    organizerCollege,
                    organizerPhone,
                    organizerFoodType,
                    registrationType,
                    paperTopic: isPaperPresentation(event.name) ? paperTopics[eventId] : undefined,
                    teamMembers: members.map(m => ({
                        memberRollNo: m.rollNo,
                        memberName: m.name,
                        memberEmail: m.email,
                        memberDept: m.dept,
                        memberPhone: m.phone,
                        memberFoodType: m.foodType
                    }))
                };
            }).filter(Boolean);

            if (registrations.length > 0) {
                const res = await apiRequest('POST', '/api/register/batch', { registrations });
                const data = await res.json();

                if (data.successfulCount === registrations.length) {
                    setBatchResults(data.results);
                    setSubmitted(true);
                    toast({ title: "Success", description: "Registration submitted successfully!" });
                } else if (data.successfulCount > 0) {
                    setBatchResults(data.results);
                    setSubmitted(true);
                    toast({
                        title: "Partial Success",
                        description: `Registered for ${data.successfulCount} out of ${registrations.length} events. See details below.`,
                        variant: "default"
                    });
                } else {
                    // All failed
                    const firstError = data.results.find((r: any) => !r.success);
                    throw new Error(firstError?.message || "Registration failed for all selected events");
                }
            } else {
                throw new Error("No valid events selected");
            }
        } catch (error: any) {
            let description: React.ReactNode = error.message || "An error occurred during registration";
            // apiRequest attaches structured fields (invalidMembers, ...) from
            // the JSON error body, so member-level conflicts can be shown directly
            if (error?.invalidMembers && Array.isArray(error.invalidMembers)) {
                description = (
                    <div className="flex flex-col gap-2 mt-2">
                        <p className="font-semibold">{error.message}</p>
                        <ul className="list-disc pl-4 space-y-2 text-sm">
                            {error.invalidMembers.map((m: any, idx: number) => (
                                <li key={idx}>
                                    <span className="font-semibold">{m.name}</span> ({m.rollNo}) - {m.reason}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            }

            toast({
                title: "Registration Failed",
                description: description,
                variant: "destructive",
                className: "max-w-md"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (fieldId: string, value: string) => {
        setFormData((prev) => ({ ...prev, [fieldId]: value }));
    };

    if (isLoadingForm) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (!form || !form.isActive) return <div className="min-h-screen flex items-center justify-center">Form not available</div>;
    if (submitted) return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <Card className="max-w-lg w-full p-6">
                <div className="text-center mb-6">
                    <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Registration Processed</h2>
                    <p className="text-muted-foreground text-sm">Here is the status of your registration request:</p>
                </div>

                <div className="space-y-4 mb-6">
                    {batchResults.map((result, idx) => {
                        const eventName = events?.find(e => e.id === result.eventId)?.name || "Unknown Event";
                        return (
                            <div key={idx} className={`p-3 rounded-lg border flex items-start gap-3 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                {result.success ? (
                                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                                ) : (
                                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                                )}
                                <div>
                                    <div className={`font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                                        {eventName}
                                    </div>
                                    <div className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                                        {result.success ? "Successfully registered" : (result.message || "Registration failed")}
                                    </div>
                                    {result.invalidMembers && result.invalidMembers.length > 0 && (
                                        <ul className="list-disc list-inside text-xs mt-1 text-red-600">
                                            {result.invalidMembers.map((m: any, i: number) => (
                                                <li key={i}>{m.name}: {m.reason}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <Button className="w-full" onClick={() => window.location.reload()}>
                    Register for Another Event
                </Button>
            </Card>
        </div>
    );

    return (
        <div className="min-h-screen bg-muted/30 p-2 py-4 md:p-4 md:py-8">
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <Card className="border-2 overflow-hidden">
                    {form.headerImage && <img src={form.headerImage} alt="Header" className="w-full h-auto object-contain" />}
                    <CardHeader>
                        <CardTitle className="text-2xl md:text-3xl">{form.title}</CardTitle>
                        {form.description && <CardDescription className="text-base">{form.description}</CardDescription>}
                    </CardHeader>
                </Card>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Personal Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl">Personal Information</CardTitle>
                            <CardDescription>Please fill in your details below</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {form.formFields.map((field) => (
                                    <DynamicFormField
                                        key={field.id}
                                        field={field}
                                        value={formData[field.id] || ""}
                                        onChange={(value) => handleChange(field.id, value)}
                                        onBlur={handleOrganizerRollNoBlur}
                                        colleges={colleges}
                                    />
                                ))}
                                {/* Food Type Selection for Organizer */}
                                <div className="space-y-2">
                                    <Label htmlFor="organizerFoodType">
                                        Food Preference <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                        value={organizerFoodType}
                                        onValueChange={(value) => setOrganizerFoodType(value as FoodType)}
                                        disabled={organizerFoodTypeLocked}
                                    >
                                        <SelectTrigger id="organizerFoodType" className={organizerFoodTypeLocked ? "opacity-70" : ""}>
                                            <SelectValue placeholder="Select food preference" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="veg">🥬 Vegetarian</SelectItem>
                                            <SelectItem value="nonveg">🍗 Non-Vegetarian</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {organizerFoodTypeLocked && (
                                        <p className="text-xs text-muted-foreground">🔒 Food preference locked for this roll number</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Event Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl">Event Selection</CardTitle>
                            <CardDescription>Choose events (Max 1 Technical + 1 Non-Technical)</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {[
                                { title: "Technical Events", events: technicalEvents, selected: selectedTech, setSelected: setSelectedTech, type: 'technical' },
                                { title: "Non-Technical Events", events: nonTechnicalEvents, selected: selectedNonTech, setSelected: setSelectedNonTech, type: 'non_technical' }
                            ].map((section) => (
                                section.events.length > 0 && (
                                    <div key={section.type} className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-lg">{section.title}</h3>
                                            <Badge variant="secondary">Select 1</Badge>
                                        </div>
                                        <RadioGroup value={section.selected || ''} onValueChange={section.setSelected}>
                                            <div className="space-y-3">
                                                {section.events.map((event) => (
                                                    <div key={event.id} className={`border rounded-lg p-4 transition-colors ${section.selected === event.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                                                        <div className="flex items-start gap-3">
                                                            <RadioGroupItem
                                                                value={event.id}
                                                                id={`${section.type}-${event.id}`}
                                                                className="mt-1"
                                                                onClick={(e) => {
                                                                    if (section.selected === event.id) {
                                                                        e.preventDefault();
                                                                        section.setSelected(null);
                                                                    }
                                                                }}
                                                            />
                                                            <div className="flex-1">
                                                                <Label htmlFor={`${section.type}-${event.id}`} className="font-semibold text-base cursor-pointer">
                                                                    {event.name}
                                                                </Label>
                                                                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{event.description}</p>
                                                                <div className="flex flex-wrap gap-2 md:gap-4 mt-2 text-xs text-muted-foreground">
                                                                    <span>📅 {formatEventTime(event)}</span>
                                                                    <span className="font-medium text-primary">
                                                                        👥 Team Size: {event.minMembers} - {event.maxMembers}
                                                                    </span>
                                                                </div>

                                                                {/* Paper Presentation Topic Selection */}
                                                                {section.selected === event.id && isPaperPresentation(event.name) && (
                                                                    <div className="mt-4 p-4 bg-background rounded-md border">
                                                                        <div className="space-y-2">
                                                                            <Label htmlFor={`paper-topic-${event.id}`} className="font-medium">
                                                                                📝 Paper Topic <span className="text-destructive">*</span>
                                                                            </Label>
                                                                            <Select
                                                                                value={paperTopics[event.id] || ''}
                                                                                onValueChange={(value) => setPaperTopics(prev => ({ ...prev, [event.id]: value }))}
                                                                            >
                                                                                <SelectTrigger id={`paper-topic-${event.id}`}>
                                                                                    <SelectValue placeholder="Select your paper topic" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {PAPER_PRESENTATION_TOPICS.map((topic) => (
                                                                                        <SelectItem key={topic} value={topic}>
                                                                                            {topic}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <p className="text-xs text-muted-foreground">Select the topic your paper/presentation will cover</p>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Team Member Input Section */}
                                                                {section.selected === event.id && event.maxMembers > 1 && (
                                                                    <div className="mt-4 p-4 bg-background rounded-md border">
                                                                        <div className="flex justify-between items-center mb-3">
                                                                            <h4 className="font-medium flex items-center gap-2">
                                                                                <Users className="h-4 w-4" /> Team Members
                                                                            </h4>
                                                                            <Button type="button" variant="outline" size="sm" onClick={() => handleAddTeamMember(event.id)} disabled={(teamMembers[event.id]?.length || 0) + 1 >= event.maxMembers}>
                                                                                <Plus className="h-3 w-3 mr-1" /> Add Member
                                                                            </Button>
                                                                        </div>

                                                                        <div className="space-y-3">
                                                                            {(teamMembers[event.id] || []).map((member, idx) => (
                                                                                <div key={idx} className="space-y-2 border-b pb-3 last:border-0">
                                                                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                                                                                        <div className="md:col-span-1"><Label className="text-xs">Roll No</Label><Input value={member.rollNo} onChange={e => handleTeamMemberChange(event.id, idx, 'rollNo', e.target.value)} onBlur={() => handleTeamMemberRollNoBlur(event.id, idx)} className="h-8" placeholder="Roll No" /></div>
                                                                                        <div className="md:col-span-1"><Label className="text-xs">Name</Label><Input value={member.name} onChange={e => handleTeamMemberChange(event.id, idx, 'name', e.target.value)} className="h-8" placeholder="Name" /></div>
                                                                                        <div className="md:col-span-1"><Label className="text-xs">Email</Label><Input value={member.email} onChange={e => handleTeamMemberChange(event.id, idx, 'email', e.target.value)} className="h-8" placeholder="Email" /></div>
                                                                                        <div className="md:col-span-1"><Label className="text-xs">Phone</Label><Input value={member.phone} onChange={e => handleTeamMemberChange(event.id, idx, 'phone', e.target.value)} className="h-8" placeholder="Phone" /></div>
                                                                                        <div className="md:col-span-1 flex justify-end"><Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveTeamMember(event.id, idx)} className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button></div>
                                                                                    </div>
                                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                                        <div>
                                                                                            <Label className="text-xs">Department</Label>
                                                                                            <Select
                                                                                                value={member.deptIsOther ? "Others" : (member.dept && DEPARTMENT_OPTIONS.slice(0, -1).includes(member.dept as any) ? member.dept : undefined)}
                                                                                                onValueChange={(value) => {
                                                                                                    if (value === "Others") {
                                                                                                        handleTeamMemberChange(event.id, idx, 'deptIsOther', 'true');
                                                                                                        handleTeamMemberChange(event.id, idx, 'dept', '');
                                                                                                    } else {
                                                                                                        handleTeamMemberChange(event.id, idx, 'deptIsOther', '');
                                                                                                        handleTeamMemberChange(event.id, idx, 'dept', value);
                                                                                                    }
                                                                                                }}
                                                                                            >
                                                                                                <SelectTrigger className="h-8">
                                                                                                    <SelectValue placeholder="Select dept" />
                                                                                                </SelectTrigger>
                                                                                                <SelectContent>
                                                                                                    {DEPARTMENT_OPTIONS.map((dept) => (
                                                                                                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                                                                                    ))}
                                                                                                </SelectContent>
                                                                                            </Select>
                                                                                            {member.deptIsOther && (
                                                                                                <Input
                                                                                                    className="h-8 mt-1"
                                                                                                    placeholder="Enter department"
                                                                                                    value={member.dept}
                                                                                                    onChange={e => handleTeamMemberChange(event.id, idx, 'dept', e.target.value)}
                                                                                                />
                                                                                            )}
                                                                                        </div>
                                                                                        <div>
                                                                                            <Label className="text-xs">Food Preference {member.foodTypeLocked && <span className="text-muted-foreground">🔒</span>}</Label>
                                                                                            <Select
                                                                                                value={member.foodType}
                                                                                                onValueChange={(value) => handleTeamMemberChange(event.id, idx, 'foodType', value)}
                                                                                                disabled={member.foodTypeLocked}
                                                                                            >
                                                                                                <SelectTrigger className={`h-8 ${member.foodTypeLocked ? "opacity-70" : ""}`}>
                                                                                                    <SelectValue placeholder="Select" />
                                                                                                </SelectTrigger>
                                                                                                <SelectContent>
                                                                                                    <SelectItem value="veg">🥬 Veg</SelectItem>
                                                                                                    <SelectItem value="nonveg">🍗 Non-Veg</SelectItem>
                                                                                                </SelectContent>
                                                                                            </Select>
                                                                                            {member.foodTypeLocked && (
                                                                                                <p className="text-xs text-muted-foreground mt-1">Locked from previous registration</p>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                            {(teamMembers[event.id]?.length || 0) === 0 && event.minMembers > 1 && (
                                                                                <p className="text-xs text-amber-600">⚠️ This event requires at least {event.minMembers} members (including you).</p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </RadioGroup>
                                    </div>
                                )
                            ))}
                        </CardContent>
                    </Card>

                    <div className="flex justify-end">
                        <Button type="submit" size="lg" disabled={isSubmitting} className="min-w-[200px]">
                            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : 'Submit Registration'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
