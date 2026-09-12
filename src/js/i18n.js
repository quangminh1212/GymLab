// ── GymLab i18n System ──
// Lightweight internationalization with lazy locale loading.

(function () {
    'use strict';

    const STORAGE_KEY = 'gymlab_locale';
    const DEFAULT_LOCALE = 'en';
    const SUPPORTED = ['en', 'vi'];

    // ── Inline locale bundles (avoids extra network requests) ──
    const LOCALES = {
        en: {
            // Navigation
            'nav.home': 'Home',
            'nav.video': 'Video Analysis',
            'nav.add': 'Add Workout',
            'nav.history': 'History',
            'nav.stats': 'Stats',
            'nav.records': 'Records',
            'nav.weight': 'Body Weight',
            'nav.settings': 'Settings',

            // Home
            'home.greeting': 'Hello, {name}!',
            'home.greeting_default': 'Hello!',
            'home.today_workouts': "Today's Workouts",
            'home.personal_records': 'Personal Records',
            'home.no_workouts_today': 'No workouts yet today',
            'home.no_records': 'No records yet',
            'home.stat_today_cal': 'TODAY KCAL',
            'home.stat_week_cal': 'WEEK KCAL',
            'home.stat_week_count': 'SESSIONS/WEEK',
            'home.stat_month_count': 'SESSIONS/MONTH',

            // Add Workout
            'add.title': 'Add Workout',
            'add.exercise_group': 'Exercise Group',
            'add.exercise': 'Exercise',
            'add.sets': 'Sets',
            'add.reps': 'Reps',
            'add.weight_kg': 'kg',
            'add.duration': 'Duration (minutes)',
            'add.notes': 'Notes',
            'add.notes_placeholder': 'Notes...',
            'add.calorie_estimate': 'Calorie Estimate',
            'add.save': 'Save Workout',
            'add.save_template': 'Save as Template',
            'add.quick_templates': 'Quick Templates',
            'add.no_templates': 'No templates yet',
            'add.validation_error': 'Please enter valid Sets and Reps',
            'add.template_saved': 'Template saved!',

            // Categories
            'cat.strength': 'Strength',
            'cat.cardio': 'Cardio',
            'cat.hiit': 'HIIT',
            'cat.flexibility': 'Flexibility',
            'cat.all': 'All',

            // History
            'history.title': 'History',
            'history.no_data': 'No data yet',

            // Stats
            'stats.title': 'Stats',
            'stats.total_kcal': 'TOTAL KCAL',
            'stats.avg_daily': 'AVG/DAY',
            'stats.active_days': 'ACTIVE DAYS',
            'stats.workouts': 'WORKOUTS',
            'stats.cal_by_day': 'Calories by Day',
            'stats.exercise_dist': 'Exercise Distribution',
            'stats.exercise_progress': 'Exercise Progress',

            // Records
            'records.title': 'Personal Records',
            'records.no_records': 'No records yet',

            // Weight
            'weight.title': 'Body Weight',
            'weight.weight_kg': 'Weight (kg)',
            'weight.log': 'Log',
            'weight.chart_title': 'Weight Over Time',
            'weight.history': 'Weight History',
            'weight.no_data': 'No weight data yet',

            // Settings
            'settings.title': 'Settings',
            'settings.name': 'Name',
            'settings.name_placeholder': 'Name...',
            'settings.body_weight': 'Body Weight (kg)',
            'settings.body_weight_hint': 'Calorie calculation per ACSM',
            'settings.save': 'Save',
            'settings.saved': 'Saved!',
            'settings.run_diagnostics': 'Run AI Diagnostics',
            'settings.diagnostics_hint': 'Test pose model and OCR locally; no data uploaded.',

            // Video Analysis
            'video.title': 'Video Analysis',
            'video.subtitle': 'Exercise recognition and rep counting, processed locally on your device',
            'video.dropzone_title': 'Choose or drag & drop a video',
            'video.dropzone_hint': 'MP4, WebM, or MOV · processed locally, never uploaded',
            'video.body_weight_label': 'Body weight (kg)',
            'video.body_weight_hint': 'Used for kcal estimation per MET; defaults to 70 kg until confirmed.',
            'video.body_weight_confirm': 'Confirm using this weight for kcal calculation',
            'video.load_label': 'Weight (kg, optional)',
            'video.load_hint': 'Prioritizes OCR kg labels in video; editable manually.',
            'video.load_confirm': 'Confirm OCR label is the exercise load',
            'video.analyze': 'Analyze Video',
            'video.preparing_model': 'Preparing model...',
            'video.status_hint': 'Choose a video with full body visible and stable lighting to get started.',
            'video.result_heading': 'AI RESULT',
            'video.no_result': 'No results yet',
            'video.reps': 'Reps',
            'video.sets_est': 'Sets (est.)',
            'video.load': 'Load',
            'video.calories_est': 'Calories (est.)',
            'video.active_time': 'Active Time',
            'video.pose_coverage': 'Pose Coverage',
            'video.ai_scope': 'AI Scope',
            'video.weight_source': 'Weight Source',
            'video.weight_evidence': 'Weight Evidence',
            'video.body_weight_src': 'Body Weight Source',
            'video.calorie_formula': 'Calorie Formula',
            'video.review_exercise': 'Exercise Review',
            'video.review_reps': 'Reps Review',
            'video.review_keep_ai': 'Keep AI result',
            'video.review_exercise_hint': 'Re-select if camera angle makes AI uncertain.',
            'video.review_reps_hint': 'Only edit when the displayed reps count is wrong.',
            'video.save_to_journal': 'Save to Journal',
            'video.export_audit': 'Export Audit Report',
            'video.measurement_limits': 'Measurement Limits',
            'video.measurement_limits_text': 'Pose model detects motion and counts reps; AI score is a heuristic (not calibrated probability). OCR reads kg/lb only when labels are clear and repeat across multiple frames. Without labels, GymLab keeps "Unknown" instead of fabricating kg values. kcal is estimated per MET, not a physiological measurement.',
            'video.ocr_progress': 'Reading OCR from frames...',
            'video.analysis_complete': 'Analysis complete!',
            'video.export_success': 'Audit report exported!',
            'video.file_too_large': 'File too large. Please use a video under 200 MB.',
            'video.ready': 'Video loaded. Click "Analyze Video" to begin.',
            'video.reading_metadata': 'Reading metadata...',

            // Weight unknown states
            'weight.unknown': 'Unknown',
            'weight.unknown_label': "Don't know",

            // AI Confidence
            'video.confidence_badge': 'AI Score (estimate)',

            // Delete confirmations
            'confirm.delete_workout': 'Delete this workout?',
            'confirm.delete_template': 'Delete template?',

            // Toast messages
            'toast.logged_count': 'Logged {count} exercises from template!',

            // Re-log
            'relog.re_log': 'Re-log',
            'relog.note': 'Re-log from {date}',

            // Format helpers
            'format.kcal': 'kcal',
            'format.cal': 'Cal',

            // Accessibility
            'a11y.main_content': 'Main content',
            'a11y.page_changed': 'Navigated to {page}',

            // Weight source labels
            'source.default': 'default',
            'source.settings': 'user settings',
            'source.video': 'from video',
            'source.unknown_video': 'Undetermined from video',

            // Exercise names (for fallback display)
            'exercise.unknown': 'Unknown',

            // Export
            'export.json_audit': 'JSON Audit Report',

            // Misc
            'misc.version': 'v{version}',
            'format.days_short': 'days',
            'format.exercises': 'exercises',
            'add.template_name_prompt': 'Template name:',
            'settings.language': 'Language',
        },
        vi: {
            // Navigation
            'nav.home': 'Trang chủ',
            'nav.video': 'Phân tích video',
            'nav.add': 'Thêm buổi tập',
            'nav.history': 'Lịch sử',
            'nav.stats': 'Thống kê',
            'nav.records': 'Kỷ lục',
            'nav.weight': 'Cân nặng',
            'nav.settings': 'Cài đặt',

            // Home
            'home.greeting': 'Xin chào, {name}!',
            'home.greeting_default': 'Xin chào!',
            'home.today_workouts': 'Buổi tập hôm nay',
            'home.personal_records': 'Kỷ lục cá nhân',
            'home.no_workouts_today': 'Chưa có buổi tập nào hôm nay',
            'home.no_records': 'Chưa có kỷ lục',
            'home.stat_today_cal': 'HÔM NAY KCAL',
            'home.stat_week_cal': 'TUẦN KCAL',
            'home.stat_week_count': 'BUỔI/TUẦN',
            'home.stat_month_count': 'BUỔI/THÁNG',

            // Add Workout
            'add.title': 'Thêm buổi tập',
            'add.exercise_group': 'Nhóm bài tập',
            'add.exercise': 'Bài tập',
            'add.sets': 'Sets',
            'add.reps': 'Reps',
            'add.weight_kg': 'kg',
            'add.duration': 'Thời gian (phút)',
            'add.notes': 'Ghi chú',
            'add.notes_placeholder': 'Ghi chú...',
            'add.calorie_estimate': 'Ước tính calo',
            'add.save': 'Lưu buổi tập',
            'add.save_template': 'Lưu làm template',
            'add.quick_templates': 'Templates nhanh',
            'add.no_templates': 'Chưa có template nào',
            'add.validation_error': 'Vui lòng nhập Sets và Reps hợp lệ',
            'add.template_saved': 'Đã lưu template!',

            // Categories
            'cat.strength': 'Sức mạnh',
            'cat.cardio': 'Cardio',
            'cat.hiit': 'HIIT',
            'cat.flexibility': 'Linh hoạt',
            'cat.all': 'Tất cả',

            // History
            'history.title': 'Lịch sử',
            'history.no_data': 'Chưa có dữ liệu',

            // Stats
            'stats.title': 'Thống kê',
            'stats.total_kcal': 'TỔNG KCAL',
            'stats.avg_daily': 'TB/NGÀY',
            'stats.active_days': 'NGÀY TẬP',
            'stats.workouts': 'BUỔI TẬP',
            'stats.cal_by_day': 'Calo theo ngày',
            'stats.exercise_dist': 'Phân bổ bài tập',
            'stats.exercise_progress': 'Tiến bộ bài tập',

            // Records
            'records.title': 'Kỷ lục cá nhân',
            'records.no_records': 'Chưa có kỷ lục nào',

            // Weight
            'weight.title': 'Cân nặng',
            'weight.weight_kg': 'Cân nặng (kg)',
            'weight.log': 'Ghi nhận',
            'weight.chart_title': 'Cân nặng theo ngày',
            'weight.history': 'Lịch sử cân nặng',
            'weight.no_data': 'Chưa có dữ liệu cân nặng',

            // Settings
            'settings.title': 'Cài đặt',
            'settings.name': 'Tên',
            'settings.name_placeholder': 'Tên...',
            'settings.body_weight': 'Cân nặng (kg)',
            'settings.body_weight_hint': 'Tính calories theo ACSM',
            'settings.save': 'Lưu',
            'settings.saved': 'Đã lưu!',
            'settings.run_diagnostics': 'Chạy kiểm tra AI local',
            'settings.diagnostics_hint': 'Kiểm tra pose model và OCR ngay trên thiết bị; không tải dữ liệu lên máy chủ.',

            // Video Analysis
            'video.title': 'Phân tích video',
            'video.subtitle': 'Nhận diện bài tập và đếm reps trực tiếp trên thiết bị',
            'video.dropzone_title': 'Chọn hoặc kéo thả video',
            'video.dropzone_hint': 'MP4, WebM hoặc MOV · xử lý cục bộ, không tải lên máy chủ',
            'video.body_weight_label': 'Cân nặng người tập (kg)',
            'video.body_weight_hint': 'Dùng để ước tính kcal theo MET; nếu chưa xác nhận, hệ thống ghi rõ mặc định 70 kg.',
            'video.body_weight_confirm': 'Xác nhận dùng cân nặng này để tính kcal',
            'video.load_label': 'Tạ (kg, tùy chọn)',
            'video.load_hint': 'Ưu tiên OCR nhãn kg trong video; có thể sửa thủ công.',
            'video.load_confirm': 'Xác nhận nhãn OCR là tải của bài tập',
            'video.analyze': 'Phân tích video',
            'video.preparing_model': 'Đang chuẩn bị model...',
            'video.status_hint': 'Chọn một video có đủ toàn thân và ánh sáng ổn định để bắt đầu.',
            'video.result_heading': 'KẾT QUẢ AI',
            'video.no_result': 'Chưa có kết quả',
            'video.reps': 'Reps',
            'video.sets_est': 'Sets ước tính',
            'video.load': 'Tạ',
            'video.calories_est': 'Calo ước tính',
            'video.active_time': 'Thời gian vận động',
            'video.pose_coverage': 'Độ phủ pose',
            'video.ai_scope': 'Phạm vi AI',
            'video.weight_source': 'Nguồn kg',
            'video.weight_evidence': 'Bằng chứng kg',
            'video.body_weight_src': 'Nguồn cân nặng',
            'video.calorie_formula': 'Công thức kcal',
            'video.review_exercise': 'Bài tập xác nhận',
            'video.review_reps': 'Reps xác nhận',
            'video.review_keep_ai': 'Giữ kết quả AI',
            'video.review_exercise_hint': 'Chọn lại nếu góc quay làm AI chưa chắc chắn.',
            'video.review_reps_hint': 'Chỉ sửa khi số reps hiển thị chưa đúng.',
            'video.save_to_journal': 'Lưu vào nhật ký',
            'video.export_audit': 'Xuất báo cáo JSON audit',
            'video.measurement_limits': 'Giới hạn đo lường',
            'video.measurement_limits_text': 'pose model dùng để nhận diện chuyển động và đếm reps; điểm AI là heuristic chưa calibration, không phải xác suất chính xác. OCR chỉ đọc được kg/lb khi nhãn hiển thị đủ rõ và lặp lại trên nhiều frame. Nếu không có nhãn, GymLab giữ "Chưa xác định" thay vì bịa số kg. Kcal là ước tính theo MET, không thay thế thiết bị đo sinh lý.',
            'video.ocr_progress': 'Đang đọc OCR từ các frame...',
            'video.analysis_complete': 'Phân tích xong!',
            'video.export_success': 'Đã xuất báo cáo audit!',
            'video.file_too_large': 'File quá lớn. Vui lòng dùng video dưới 200 MB.',
            'video.ready': 'Video đã tải. Nhấn "Phân tích video" để bắt đầu.',
            'video.reading_metadata': 'Đang đọc metadata...',

            // Weight unknown states
            'weight.unknown': 'Chưa xác định',
            'weight.unknown_label': 'Chưa biết',

            // AI Confidence
            'video.confidence_badge': 'Điểm AI (ước tính)',

            // Delete confirmations
            'confirm.delete_workout': 'Xóa buổi tập?',
            'confirm.delete_template': 'Xóa template?',

            // Toast messages
            'toast.logged_count': 'Đã ghi nhận {count} bài tập từ template!',

            // Re-log
            'relog.re_log': 'Re-log',
            'relog.note': 'Re-log từ {date}',

            // Format helpers
            'format.kcal': 'kcal',
            'format.cal': 'Cal',

            // Accessibility
            'a11y.main_content': 'Nội dung chính',
            'a11y.page_changed': 'Đã chuyển sang trang {page}',

            // Weight source labels
            'source.default': 'mặc định',
            'source.settings': 'người dùng nhập',
            'source.video': 'từ video',
            'source.unknown_video': 'Chưa xác định từ video',

            // Exercise names (for fallback display)
            'exercise.unknown': 'Không rõ',

            // Export
            'export.json_audit': 'Báo cáo Audit JSON',

            // Misc
            'misc.version': 'v{version}',
            'format.days_short': 'ngày',
            'format.exercises': 'bài',
            'add.template_name_prompt': 'Tên template:',
            'settings.language': 'Ngôn ngữ',
        },
    };

    let currentLocale = DEFAULT_LOCALE;

    /**
     * Get a translation by key, with optional interpolation.
     * @param {string} key - Dot-notated key, e.g. 'home.greeting'
     * @param {Object} [params] - Interpolation params, e.g. { name: 'Minh' }
     * @returns {string}
     */
    function t(key, params) {
        const bundle = LOCALES[currentLocale] || LOCALES[DEFAULT_LOCALE];
        let str = bundle[key] || LOCALES[DEFAULT_LOCALE][key] || key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
            }
        }
        return str;
    }

    /**
     * Get the current locale code.
     */
    function getLocale() {
        return currentLocale;
    }

    /**
     * Get the browser's preferred locale from supported list.
     */
    function detectLocale() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && SUPPORTED.includes(saved)) return saved;
        } catch (_) {}
        const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
        if (nav.startsWith('vi')) return 'vi';
        return DEFAULT_LOCALE;
    }

    /**
     * Set locale and persist.
     */
    function setLocale(locale) {
        if (!SUPPORTED.includes(locale)) return;
        currentLocale = locale;
        try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) {}
        document.documentElement.lang = locale;
    }

    /**
     * Format a date using the current locale.
     */
    function formatDate(date, options) {
        const d = date instanceof Date ? date : new Date(date);
        const localeMap = { en: 'en-US', vi: 'vi-VN' };
        return d.toLocaleDateString(localeMap[currentLocale] || 'en-US', options);
    }

    /**
     * Get the list of supported locale codes with display names.
     */
    function getSupportedLocales() {
        return [
            { code: 'en', name: 'English' },
            { code: 'vi', name: 'Tiếng Việt' },
        ];
    }

    // Initialize
    currentLocale = detectLocale();
    document.documentElement.lang = currentLocale;

    // Public API
    window.GymLabI18n = { t, getLocale, setLocale, formatDate, getSupportedLocales, SUPPORTED };
})();
