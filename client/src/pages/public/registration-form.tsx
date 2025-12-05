import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Plus, Trash2, Users, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RegistrationForm, Event } from "@shared/schema";

interface EventWithRounds extends Event {
    rounds?: Array<{ startTime: Date | string | null; endTime: Date | string | null }>;
}

interface TeamMember {
    rollNo: string;
    name: string;
    email: string;
    dept: string;
    phone: string;
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
    const [isSubmitting, setIsSubmitting] = useState(false);

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
        // ... (rest of time formatting logic same as before)
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
            [eventId]: [...(prev[eventId] || []), { rollNo: '', name: '', email: '', dept: '', phone: '' }]
        }));
    };

    const handleRemoveTeamMember = (eventId: string, index: number) => {
        setTeamMembers(prev => ({
            ...prev,
            [eventId]: (prev[eventId] || []).filter((_, i) => i !== index)
        }));
    };

    const handleTeamMemberChange = (eventId: string, index: number, field: keyof TeamMember, value: string) => {
        setTeamMembers(prev => {
            const members = [...(prev[eventId] || [])];
            members[index] = { ...members[index], [field]: value };
            return { ...prev, [eventId]: members };
        });
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

        if (!organizerRollNo || !organizerName || !organizerEmail || !organizerDept || !organizerPhone) {
            errors.push("Could not identify required student details (Name, Roll No, Email, Dept, Phone) from the form. Please ensure these fields are filled.");
        }

        // 3. Validate Team Members
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
            }
        });

        if (errors.length > 0) {
            toast({ title: "Validation Error", description: errors.join(", "), variant: "destructive" });
            return;
        }

        setIsSubmitting(true);

        try {
            // 4. Submit for each selected event
            for (const eventId of selectedEventIds) {
                const event = events?.find(e => e.id === eventId);
                if (!event) continue;

                const members = teamMembers[eventId] || [];
                const registrationType = (event.minMembers > 1 || members.length > 0) ? 'team' : 'solo';

                await apiRequest('POST', '/api/register', {
                    eventId,
                    organizerRollNo,
                    organizerName,
                    organizerEmail,
                    organizerDept,
                    organizerPhone,
                    registrationType,
                    teamMembers: members.map(m => ({
                        memberRollNo: m.rollNo,
                        memberName: m.name,
                        memberEmail: m.email,
                        memberDept: m.dept,
                        memberPhone: m.phone
                    }))
                });
            }

            setSubmitted(true);
            toast({ title: "Success", description: "Registration submitted successfully!" });
        } catch (error: any) {
            toast({
                title: "Registration Failed",
                description: error.message || "An error occurred during registration",
                variant: "destructive"
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
        <div className="min-h-screen flex items-center justify-center bg-muted/30">
            <Card className="max-w-lg p-8 text-center">
                <CheckCircle className="h-20 w-20 text-green-600 mx-auto mb-4" />
                <h2 className="text-3xl font-bold mb-3">Registration Submitted!</h2>
                <p className="text-muted-foreground">Thank you for registering. Check your email for confirmation.</p>
            </Card>
        </div>
    );

    return (
        <div className="min-h-screen bg-muted/30 p-4 py-8">
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <Card className="border-2 overflow-hidden">
                    {form.headerImage && <img src={form.headerImage} alt="Header" className="w-full h-48 object-cover" />}
                    <CardHeader>
                        <CardTitle className="text-3xl">{form.title}</CardTitle>
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
                                    <div key={field.id} className="space-y-2">
                                        <Label htmlFor={field.id}>{field.label} {field.required && <span className="text-destructive">*</span>}</Label>
                                        <Input
                                            id={field.id}
                                            type={field.type}
                                            placeholder={field.placeholder || ''}
                                            value={formData[field.id] || ""}
                                            onChange={(e) => handleChange(field.id, e.target.value)}
                                            required={field.required}
                                        />
                                    </div>
                                ))}
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
                                                            <RadioGroupItem value={event.id} id={`${section.type}-${event.id}`} className="mt-1" />
                                                            <div className="flex-1">
                                                                <Label htmlFor={`${section.type}-${event.id}`} className="font-semibold text-base cursor-pointer">
                                                                    {event.name}
                                                                </Label>
                                                                <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                                                                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                                                    <span>📅 {formatEventTime(event)}</span>
                                                                    <span className="font-medium text-primary">
                                                                        👥 Team Size: {event.minMembers} - {event.maxMembers}
                                                                    </span>
                                                                </div>

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
                                                                                <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border-b pb-3 last:border-0">
                                                                                    <div className="md:col-span-1"><Label className="text-xs">Roll No</Label><Input value={member.rollNo} onChange={e => handleTeamMemberChange(event.id, idx, 'rollNo', e.target.value)} className="h-8" placeholder="Roll No" /></div>
                                                                                    <div className="md:col-span-1"><Label className="text-xs">Name</Label><Input value={member.name} onChange={e => handleTeamMemberChange(event.id, idx, 'name', e.target.value)} className="h-8" placeholder="Name" /></div>
                                                                                    <div className="md:col-span-1"><Label className="text-xs">Email</Label><Input value={member.email} onChange={e => handleTeamMemberChange(event.id, idx, 'email', e.target.value)} className="h-8" placeholder="Email" /></div>
                                                                                    <div className="md:col-span-1"><Label className="text-xs">Dept</Label><Input value={member.dept} onChange={e => handleTeamMemberChange(event.id, idx, 'dept', e.target.value)} className="h-8" placeholder="Dept" /></div>
                                                                                    <div className="md:col-span-1"><Label className="text-xs">Phone</Label><Input value={member.phone} onChange={e => handleTeamMemberChange(event.id, idx, 'phone', e.target.value)} className="h-8" placeholder="Phone" /></div>
                                                                                    <div className="md:col-span-1 flex justify-end"><Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveTeamMember(event.id, idx)} className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button></div>
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
