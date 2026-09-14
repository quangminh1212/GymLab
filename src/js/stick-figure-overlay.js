/**
 * GymLab Stick Figure Overlay
 * Hiển thị skeleton người que real-time trên video khi phân tích pose
 * Sử dụng 33 MediaPipe Pose Landmarks
 */

// MediaPipe Pose landmark connections (pairs of indices)
const POSE_CONNECTIONS = [
    // Torso
    [11, 12], // shoulders
    [23, 24], // hips
    [11, 23], // left torso
    [12, 24], // right torso
    
    // Left arm
    [11, 13], [13, 15], // shoulder -> elbow -> wrist
    [15, 17], [15, 19], [15, 21], // wrist -> hand landmarks
    
    // Right arm  
    [12, 14], [14, 16],
    [16, 18], [16, 20], [16, 22],
    
    // Left leg
    [23, 25], [25, 27], // hip -> knee -> ankle
    [27, 29], [27, 31], // ankle -> foot
    
    // Right leg
    [24, 26], [26, 28],
    [28, 30], [28, 32],
    
    // Face (simplified)
    [0, 1], [1, 2], [2, 3], [3, 7], // nose -> eye -> ear
    [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10], // mouth
];

// Landmark indices for angle calculation
const ANGLE_LANDMARKS = {
    left_knee: [23, 25, 27],   // hip-knee-ankle
    right_knee: [24, 26, 28],
    left_elbow: [11, 13, 15],  // shoulder-elbow-wrist
    right_elbow: [12, 14, 16],
    left_hip: [11, 23, 25],    // shoulder-hip-knee
    right_hip: [12, 24, 26],
};

// Colors for different body parts
const COLORS = {
    torso: '#00ff88',      // Xanh lá
    left_arm: '#ff6b6b',   // Đỏ
    right_arm: '#ff9f43',  // Cam
    left_leg: '#54a0ff',   // Xanh dương
    right_leg: '#5f27cd',  // Tím
    face: '#feca57',       // Vàng
    joint: '#ffffff',      // Trắng
    angle_arc: '#ff4757',  // Đỏ đậm cho góc
    angle_text: '#ffffff',
};

class StickFigureOverlay {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.video = null;
        this.isVisible = true;
        this.showAngles = true;
        this.showLabels = false;
        this.lineWidth = 3;
        this.jointRadius = 5;
        this.lastLandmarks = null;
        this.animationFrame = null;
    }

    /**
     * Khởi tạo overlay canvas
     */
    init(videoElement) {
        this.video = videoElement;
        
        // Tạo canvas overlay
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'stick-figure-overlay';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10;
        `;
        
        // Đặt canvas vào parent của video
        const container = videoElement.parentElement;
        if (container) {
            container.style.position = 'relative';
            container.appendChild(this.canvas);
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        
        // Lắng nghe resize
        window.addEventListener('resize', () => this.resize());
        
        console.log('GymLab: Stick Figure Overlay initialized');
        return this.canvas;
    }

    /**
     * Resize canvas theo video
     */
    resize() {
        if (!this.video || !this.canvas) return;
        
        const rect = this.video.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    /**
     * Tính góc giữa 3 điểm (degrees)
     */
    calculateAngle(a, b, c) {
        if (!a || !b || !c) return null;
        
        const ab = { x: a.x - b.x, y: a.y - b.y };
        const cb = { x: c.x - b.x, y: c.y - b.y };
        
        const dot = ab.x * cb.x + ab.y * cb.y;
        const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
        const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
        
        if (magAB === 0 || magCB === 0) return null;
        
        const cosAngle = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
        return Math.acos(cosAngle) * (180 / Math.PI);
    }

    /**
     * Lấy color theo connection index
     */
    getConnectionColor(fromIdx, toIdx) {
        // Arms
        if ([11, 13, 15, 17, 19, 21].includes(fromIdx) && [11, 13, 15, 17, 19, 21].includes(toIdx)) {
            return COLORS.left_arm;
        }
        if ([12, 14, 16, 18, 20, 22].includes(fromIdx) && [12, 14, 16, 18, 20, 22].includes(toIdx)) {
            return COLORS.right_arm;
        }
        // Legs
        if ([23, 25, 27, 29, 31].includes(fromIdx) && [23, 25, 27, 29, 31].includes(toIdx)) {
            return COLORS.left_leg;
        }
        if ([24, 26, 28, 30, 32].includes(fromIdx) && [24, 26, 28, 30, 32].includes(toIdx)) {
            return COLORS.right_leg;
        }
        // Face
        if (fromIdx < 11 && toIdx < 11) {
            return COLORS.face;
        }
        // Torso
        return COLORS.torso;
    }

    /**
     * Vẽ angle arc và text
     */
    drawAngle(landmarks, name, indices) {
        if (!this.showAngles) return;
        
        const a = landmarks[indices[0]];
        const b = landmarks[indices[1]]; // joint point
        const c = landmarks[indices[2]];
        
        if (!a || !b || !c) return;
        
        const angle = this.calculateAngle(a, b, c);
        if (angle === null) return;
        
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        const bx = b.x * w;
        const by = b.y * h;
        
        // Vẽ arc
        const radius = 30;
        const startAngle = Math.atan2((a.y - b.y) * h, (a.x - b.x) * w);
        const endAngle = Math.atan2((c.y - b.y) * h, (c.x - b.x) * w);
        
        this.ctx.beginPath();
        this.ctx.arc(bx, by, radius, startAngle, endAngle, angle > 180);
        this.ctx.strokeStyle = COLORS.angle_arc;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Vẽ text góc
        const labelX = bx + radius * 1.5 * Math.cos((startAngle + endAngle) / 2);
        const labelY = by + radius * 1.5 * Math.sin((startAngle + endAngle) / 2);
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(labelX - 25, labelY - 10, 50, 20);
        
        this.ctx.fillStyle = COLORS.angle_text;
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${Math.round(angle)}°`, labelX, labelY);
    }

    /**
     * Render skeleton lên canvas
     */
    render(landmarks) {
        if (!this.ctx || !this.canvas || !landmarks) return;
        
        this.lastLandmarks = landmarks;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, w, h);
        
        if (!this.isVisible) return;
        
        // Vẽ connections (bones)
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        
        for (const [fromIdx, toIdx] of POSE_CONNECTIONS) {
            const from = landmarks[fromIdx];
            const to = landmarks[toIdx];
            
            if (!from || !to) continue;
            if (from.visibility < 0.3 || to.visibility < 0.3) continue;
            
            this.ctx.beginPath();
            this.ctx.moveTo(from.x * w, from.y * h);
            this.ctx.lineTo(to.x * w, to.y * h);
            this.ctx.strokeStyle = this.getConnectionColor(fromIdx, toIdx);
            this.ctx.stroke();
        }
        
        // Vẽ joints (landmarks)
        for (let i = 0; i < landmarks.length; i++) {
            const lm = landmarks[i];
            if (!lm || lm.visibility < 0.3) continue;
            
            const x = lm.x * w;
            const y = lm.y * h;
            
            // Outer circle
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.jointRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = COLORS.joint;
            this.ctx.fill();
            
            // Inner circle (color based on body part)
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.jointRadius - 2, 0, Math.PI * 2);
            
            if (i < 11) this.ctx.fillStyle = COLORS.face;
            else if (i < 23) this.ctx.fillStyle = i % 2 === 0 ? COLORS.left_arm : COLORS.right_arm;
            else this.ctx.fillStyle = i % 2 === 0 ? COLORS.left_leg : COLORS.right_leg;
            
            this.ctx.fill();
        }
        
        // Vẽ angles
        for (const [name, indices] of Object.entries(ANGLE_LANDMARKS)) {
            this.drawAngle(landmarks, name, indices);
        }
        
        // Vẽ labels (nếu bật)
        if (this.showLabels) {
            const keyPoints = {
                0: 'Mũi', 11: 'Vai L', 12: 'Vai R',
                13: 'Khuỷu L', 14: 'Khuỷu R',
                15: 'Cổ tay L', 16: 'Cổ tay R',
                23: 'Hông L', 24: 'Hông R',
                25: 'Gối L', 26: 'Gối R',
                27: 'Mắt cá L', 28: 'Mắt cá R',
            };
            
            this.ctx.font = '10px sans-serif';
            this.ctx.fillStyle = '#fff';
            this.ctx.textAlign = 'left';
            
            for (const [idx, label] of Object.entries(keyPoints)) {
                const lm = landmarks[parseInt(idx)];
                if (!lm || lm.visibility < 0.3) continue;
                
                this.ctx.fillText(label, lm.x * w + 10, lm.y * h - 10);
            }
        }
    }

    /**
     * Toggle hiện/ẩn
     */
    toggle() {
        this.isVisible = !this.isVisible;
        if (!this.isVisible && this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        return this.isVisible;
    }

    /**
     * Toggle hiển thị góc
     */
    toggleAngles() {
        this.showAngles = !this.showAngles;
        return this.showAngles;
    }

    /**
     * Toggle labels
     */
    toggleLabels() {
        this.showLabels = !this.showLabels;
        return this.showLabels;
    }

    /**
     * Destroy overlay
     */
    destroy() {
        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;
    }
}

// Export singleton
window.StickFigureOverlay = StickFigureOverlay;
