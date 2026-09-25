import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, AlertCircle, Plus, Trash2, Loader2, UserPlus, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Event } from "@shared/schema";
import { DEPARTMENT_OPTIONS } from "@shared/schema";

interface TeamMember {
    memberRollNo: string;
    memberName: string;
    memberEmail: string;
    memberPhone: string;
    memberFoodType: 'veg' | 'nonveg';
    validationStatus?: 'pending' | 'valid' | 'invalid';
    validationMessage?: string;
}

interface ValidationResult {
    valid: boolean;
    blocked: boolean;
    reason?: string;
    existingEvent?: string;
    category?: string;
}

export default function EventRegistrationPage() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [, params] = useRoute("/register/event/:eventId");
    const eventId = params?.eventId || "";

    // Organizer info
    const [organizerRollNo, setOrganizerRollNo] = useState("");
    const [organizerName, setOrganizerName] = useState("");
    const [organizerEmail, setOrganizerEmail] = useState("");
    const [organizerDept, setOrganizerDept] = useState("");
    const [organizerDeptIsOther, setOrganizerDeptIsOther] = useState(false);
    const [organizerCollege, setOrganizerCollege] = useState("");
    const [organizerPhone, setOrganizerPhone] = useState("");
    const [organizerFoodType, setOrganizerFoodType] = useState<'veg' | 'nonveg'>('veg');
    const [organizerValidation, setOrganizerValidation] = useState<ValidationResult | null>(null);
    const [isValidatingOrganizer, setIsValidatingOrganizer] = useState(false);

    // Team members
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [submitted, setSubmitted] = useState(false);

    // Fetch event details
    const { data: event, isLoading: isLoadingEvent } = useQuery<Event>({
        queryKey: [`/api/events/public/${eventId}`],
        enabled: !!eventId,
    });

    // Validate organizer roll number
    const validateOrganizerRollNo = async () => {
        if (!organizerRollNo || !eventId) return;

        setIsValidatingOrganizer(true);
        try {
            const response = await apiRequest('POST', '/api/validate-rollno', {
                rollNo: organizerRollNo,
                eventId
            });
            const result = await response.json() as ValidationResult;
            setOrganizerValidation(result);
        } catch (error) {
            setOrganizerValidation({ valid: false, blocked: true, reason: 'Validation failed' });
        } finally {
            setIsValidatingOrganizer(false);
        }
    };

    // Validate team member roll number
    const validateTeamMemberRollNo = async (index: number) => {
        const member = teamMembers[index];
        if (!member.memberRollNo || !eventId) return;

        const updatedMembers = [...teamMembers];
        updatedMembers[index].validationStatus = 'pending';
        setTeamMembers(updatedMembers);

        try {
            const response = await apiRequest('POST', '/api/validate-rollno', {
                rollNo: member.memberRollNo,
                eventId
            });
            const result = await response.json() as ValidationResult;

            updatedMembers[index].validationStatus = result.valid ? 'valid' : 'invalid';
            updatedMembers[index].validationMessage = result.reason || (result.valid ? 'Valid' : 'Already registered');
            setTeamMembers([...updatedMembers]);
        } catch (error) {
            updatedMembers[index].validationStatus = 'invalid';
            updatedMembers[index].validationMessage = 'Validation failed';
            setTeamMembers([...updatedMembers]);
        }
    };

    // Submit registration
    const submitMutation = useMutation({
        mutationFn: async () => {
            await apiRequest('POST', '/api/register', {
                eventId,
                organizerRollNo,
                organizerName,
                organizerEmail,
                organizerDept,
                organizerCollege,
                organizerPhone,
                organizerFoodType,
                teamMembers: teamMembers.map(m => ({
                    memberRollNo: m.memberRollNo,
                    memberName: m.memberName,
                    memberEmail: m.memberEmail,
                    memberDept: organizerDept,
                    memberPhone: m.memberPhone,
                    memberFoodType: m.memberFoodType,
                }))
            });
        },
        onSuccess: () => {
            setSubmitted(true);
            toast({
                title: "Registration Submitted!",
                description: "Your registration has been submitted successfully.",
            });
        },
        onError: (error: any) => {
            let title = "Registration Failed";
            let description: React.ReactNode = error.message || 'Registration failed';
            let duration = 5000;

            // Handle department limit exceeded error (machine-readable code)
            if (error?.code === 'DEPARTMENT_LIMIT_EXCEEDED') {
                title = "Department Limit Reached";
                description = (
                    <div className="space-y-2">
                        <p className="font-semibold">Only 10 unique participants are allowed per department per college.</p>
                        <p className="text-sm">
                            Department: <span className="font-medium">{error.department}</span>
                        </p>
                        <p className="text-sm">
                            Current Count: <span className="font-medium">{error.currentCount || 10}/10</span>
                        </p>
                        <p className="text-sm mt-2">This limit ensures fair participation across all departments at your college.</p>
                    </div>
                );
                duration = 10000; // 10 seconds for department limit errors
            }
            // Handle invalid members error
            else if (error?.invalidMembers && Array.isArray(error.invalidMembers)) {
                title = "Registration Conflicts Detected";
                description = (
                    <div className="mt-2 text-sm">
                        <p className="mb-2">The following participants cannot be registered:</p>
                        <ul className="list-disc pl-4 space-y-1">
                            {error.invalidMembers.map((m: any, i: number) => (
                                <li key={i} className="text-left">
                                    <span className="font-semibold">{m.rollNo}:</span> {m.reason}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            }

            toast({
                title,
                description,
                variant: "destructive",
                duration,
            });
        },
    });

    // Add team member
    const addTeamMember = () => {
        if (!event) return;
        const totalMembers = 1 + teamMembers.length;
        if (totalMembers >= event.maxMembers) {
            toast({
                title: "Team Full",
                description: `Maximum team size is ${event.maxMembers} members`,
                variant: "destructive",
            });
            return;
        }
        setTeamMembers([...teamMembers, {
            memberRollNo: '',
            memberName: '',
            memberEmail: '',
            memberPhone: '',
            memberFoodType: 'veg',
        }]);
    };

    // Remove team member
    const removeTeamMember = (index: number) => {
        setTeamMembers(teamMembers.filter((_, i) => i !== index));
    };

    // Update team member field
    const updateTeamMember = (index: number, field: keyof TeamMember, value: string | boolean) => {
        const updated = [...teamMembers];
        (updated[index] as any)[field] = value;
        setTeamMembers(updated);
    };

    // Check if form is valid
    const isFormValid = () => {
        if (!event) return false;
        const totalMembers = 1 + teamMembers.length;

        // Check team size
        if (totalMembers < event.minMembers || totalMembers > event.maxMembers) return false;

        // Check organizer
        if (!organizerRollNo || !organizerName || !organizerEmail || !organizerDept) return false;
        if (organizerValidation?.blocked) return false;

        // Check all team members (department inherited from organizer)
        for (const member of teamMembers) {
            if (!member.memberRollNo || !member.memberName || !member.memberEmail) return false;
            if (member.validationStatus === 'invalid') return false;
        }

        return true;
    };

    // Handle submit
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid()) return;
        submitMutation.mutate();
    };

    if (isLoadingEvent) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-lg">Loading event...</p>
                </div>
            </div>
        );
    }

    if (!event) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30">
                <Card className="max-w-md">
                    <CardContent className="p-6 text-center">
                        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                        <p className="text-lg font-medium">Event not found</p>
                        <p className="text-sm text-muted-foreground mt-2">
                            The event you're looking for doesn't exist or has been removed.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30">
                <Card className="max-w-lg">
                    <CardContent className="p-8 text-center">
                        <CheckCircle className="h-20 w-20 text-green-600 mx-auto mb-4" />
                        <h2 className="text-3xl font-bold mb-3">Registration Submitted!</h2>
                        <p className="text-muted-foreground mb-4">
                            Your registration for <strong>{event.name}</strong> has been submitted.
                        </p>
                        <div className="bg-muted/50 rounded-lg p-4 text-sm text-left">
                            <p className="font-semibold mb-2">What happens next?</p>
                            <ul className="space-y-1 text-muted-foreground">
                                <li>• Your registration is pending confirmation</li>
                                <li>• You'll receive login credentials after confirmation</li>
                                <li>• Check with the organizing team for updates</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const totalMembers = 1 + teamMembers.length;
    const isTeamEvent = event.maxMembers > 1;

    return (
        <div className="min-h-screen bg-muted/30 p-4 py-8">
            <div className="w-full max-w-2xl mx-auto space-y-6">
                {/* Event Header */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-2xl">{event.name}</CardTitle>
                                <CardDescription className="mt-1">{event.description}</CardDescription>
                            </div>
                            <Badge variant={event.category === 'technical' ? 'default' : 'secondary'}>
                                {event.category === 'technical' ? 'Technical' : 'Non-Technical'}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                <span>Team Size: {event.minMembers === event.maxMembers
                                    ? event.minMembers
                                    : `${event.minMembers}-${event.maxMembers}`} members</span>
                            </div>
                        </div>
                    </CardHeader>
                </Card>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Organizer Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <UserPlus className="h-5 w-5" />
                                {isTeamEvent ? 'Team Organizer' : 'Participant'} Information
                            </CardTitle>
                            <CardDescription>
                                {isTeamEvent
                                    ? 'Enter the details of the team organizer (you)'
                                    : 'Enter your registration details'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="rollNo">Roll Number <span className="text-destructive">*</span></Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="rollNo"
                                            value={organizerRollNo}
                                            onChange={(e) => setOrganizerRollNo(e.target.value.toUpperCase())}
                                            placeholder="e.g., 21CS001"
                                            required
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={validateOrganizerRollNo}
                                            disabled={!organizerRollNo || isValidatingOrganizer}
                                        >
                                            {isValidatingOrganizer ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
                                        </Button>
                                    </div>
                                    {organizerValidation && (
                                        <p className={`text-xs ${organizerValidation.valid ? 'text-green-600' : 'text-destructive'}`}>
                                            {organizerValidation.valid ? '✓ Available' : `✗ ${organizerValidation.reason}`}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="name"
                                        value={organizerName}
                                        onChange={(e) => setOrganizerName(e.target.value)}
                                        placeholder="Enter your full name"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={organizerEmail}
                                        onChange={(e) => setOrganizerEmail(e.target.value)}
                                        placeholder="email@example.com"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="dept">Department <span className="text-destructive">*</span></Label>
                                    <Select 
                                        value={organizerDeptIsOther ? "Others" : (organizerDept && DEPARTMENT_OPTIONS.slice(0, -1).includes(organizerDept as any) ? organizerDept : undefined)} 
                                        onValueChange={(val) => {
                                            if (val === "Others") {
                                                setOrganizerDeptIsOther(true);
                                                setOrganizerDept("");
                                            } else {
                                                setOrganizerDeptIsOther(false);
                                                setOrganizerDept(val);
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DEPARTMENT_OPTIONS.map((dept) => (
                                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {organizerDeptIsOther && (
                                        <Input
                                            id="dept"
                                            className="mt-2"
                                            value={organizerDept}
                                            onChange={(e) => setOrganizerDept(e.target.value)}
                                            placeholder="Enter your department"
                                            required
                                        />
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="college">College/Institution</Label>
                                    <Input
                                        id="college"
                                        value={organizerCollege}
                                        onChange={(e) => setOrganizerCollege(e.target.value)}
                                        placeholder="e.g., ABC College"
                                    />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={organizerPhone}
                                        onChange={(e) => setOrganizerPhone(e.target.value)}
                                        placeholder="10-digit mobile number"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="foodType">Food Preference <span className="text-destructive">*</span></Label>
                                    <Select 
                                        value={organizerFoodType} 
                                        onValueChange={(val: 'veg' | 'nonveg') => setOrganizerFoodType(val)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select food preference" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="veg">Veg</SelectItem>
                                            <SelectItem value="nonveg">Non-veg</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Team Members Section (only for team events) */}
                    {isTeamEvent && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            <Users className="h-5 w-5" />
                                            Team Members
                                        </CardTitle>
                                        <CardDescription>
                                            Add {event.minMembers - 1} to {event.maxMembers - 1} team members (excluding yourself)
                                        </CardDescription>
                                    </div>
                                    <Badge variant={totalMembers >= event.minMembers ? 'default' : 'destructive'}>
                                        {totalMembers} / {event.maxMembers}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {teamMembers.map((member, index) => (
                                    <div key={index} className="border rounded-lg p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-medium">Team Member {index + 1}</h4>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeTeamMember(index)}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Roll Number <span className="text-destructive">*</span></Label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={member.memberRollNo}
                                                        onChange={(e) => updateTeamMember(index, 'memberRollNo', e.target.value.toUpperCase())}
                                                        placeholder="e.g., 21CS002"
                                                        required
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => validateTeamMemberRollNo(index)}
                                                        disabled={!member.memberRollNo || member.validationStatus === 'pending'}
                                                    >
                                                        {member.validationStatus === 'pending'
                                                            ? <Loader2 className="h-4 w-4 animate-spin" />
                                                            : 'Check'}
                                                    </Button>
                                                </div>
                                                {member.validationStatus && (
                                                    <p className={`text-xs ${member.validationStatus === 'valid' ? 'text-green-600' : 'text-destructive'}`}>
                                                        {member.validationStatus === 'valid' ? '✓ Available' : `✗ ${member.validationMessage}`}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Full Name <span className="text-destructive">*</span></Label>
                                                <Input
                                                    value={member.memberName}
                                                    onChange={(e) => updateTeamMember(index, 'memberName', e.target.value)}
                                                    placeholder="Enter full name"
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Email <span className="text-destructive">*</span></Label>
                                                <Input
                                                    type="email"
                                                    value={member.memberEmail}
                                                    onChange={(e) => updateTeamMember(index, 'memberEmail', e.target.value)}
                                                    placeholder="email@example.com"
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Phone Number</Label>
                                                <Input
                                                    type="tel"
                                                    value={member.memberPhone}
                                                    onChange={(e) => updateTeamMember(index, 'memberPhone', e.target.value)}
                                                    placeholder="10-digit mobile number"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Food Preference <span className="text-destructive">*</span></Label>
                                                <Select 
                                                    value={member.memberFoodType} 
                                                    onValueChange={(val: 'veg' | 'nonveg') => updateTeamMember(index, 'memberFoodType', val)}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select food preference" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="veg">Veg</SelectItem>
                                                        <SelectItem value="nonveg">Non-veg</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {totalMembers < event.maxMembers && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={addTeamMember}
                                        className="w-full"
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Team Member
                                    </Button>
                                )}

                                {totalMembers < event.minMembers && (
                                    <p className="text-sm text-destructive text-center">
                                        You need at least {event.minMembers - totalMembers} more team member(s)
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Submit Button */}
                    <div className="flex justify-end gap-3">
                        <Button
                            type="submit"
                            size="lg"
                            disabled={submitMutation.isPending || !isFormValid()}
                            className="min-w-[200px]"
                        >
                            {submitMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                'Submit Registration'
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
