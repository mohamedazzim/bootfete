import collegeHeader from '@/assets/college-header.jpg';

/**
 * AppHeader - Fixed header banner displayed across the entire application
 * Features the PG Department of Computer Applications (MCA) branding
 */
export default function AppHeader() {
    return (
        <div className="w-full bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="w-full max-w-full overflow-hidden">
                <img
                    src={collegeHeader}
                    alt="PG Department of Computer Applications (MCA) - Bishop Heber College (Autonomous)"
                    className="w-full h-auto object-contain max-h-[60px] sm:max-h-[80px] md:max-h-[100px] lg:max-h-[120px]"
                />
            </div>
        </div>
    );
}
