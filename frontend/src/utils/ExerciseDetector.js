class ExerciseDetector {
    constructor() {
        this.currentExercise = null;
        this.repCount = 0;
        this.formFeedback = [];
        this.lastState = {
            squat: 'up',
            pushup: 'up',
            jumpingJack: 'down',
            armRaise: 'down',
            sideBend: 'center'
        };
        
        // Add exercise transition tracking
        this.exerciseConfidence = 0;
        this.confidenceThreshold = 15;
        this.potentialNewExercise = null;
        this.framesSinceLastChange = 0;
        
        // Add state tracking for better exercise detection
        this.exerciseHistory = [];
        this.historySize = 30;
        this.detectionThreshold = 0.8;
        this.minFramesForDetection = 15;
    }

    // Add the missing calculateAngle method
    calculateAngle(point1, point2, point3) {
        if (!point1 || !point2 || !point3) return 0;

        const getVector = (p1, p2) => ({
            x: p2.x - p1.x,
            y: p2.y - p1.y
        });

        const vector1 = getVector(point2, point1);
        const vector2 = getVector(point2, point3);

        const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y;
        const magnitude1 = Math.sqrt(vector1.x * vector1.x + vector1.y * vector1.y);
        const magnitude2 = Math.sqrt(vector2.x * vector2.x + vector2.y * vector2.y);

        if (magnitude1 === 0 || magnitude2 === 0) return 0;

        const cosAngle = dotProduct / (magnitude1 * magnitude2);
        const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

        return angle;
    }

    detectExercise(landmarks) {
        if (!landmarks || landmarks.length < 33) return null;

        const keyPoints = this.extractKeyPoints(landmarks);
        const detection = this.processFrame(keyPoints);
        
        // Get stable exercise identification
        const stableExercise = this.getStableExercise();
        if (stableExercise) {
            const formAnalysis = this.analyzeForm(stableExercise, keyPoints);
            
            return {
                exercise: stableExercise,
                repCount: this.repCount,
                form: formAnalysis.quality,
                feedback: formAnalysis.feedback,
                confidence: this.exerciseConfidence / this.confidenceThreshold
            };
        }

        return {
            exercise: 'unknown',
            repCount: 0,
            form: 'unknown',
            feedback: [],
            confidence: 0
        };
    }

    processFrame(keyPoints) {
        // Calculate probabilities for each exercise
        const probabilities = {
            squat: this.calculateSquatProbability(keyPoints),
            sideBend: this.calculateSideBendProbability(keyPoints)
        };

        // Update exercise history
        this.updateExerciseHistory(probabilities);

        return probabilities;
    }

    extractKeyPoints(landmarks) {
        return {
            hip: landmarks[23],
            knee: landmarks[25],
            ankle: landmarks[27],
            shoulder: landmarks[11],
            elbow: landmarks[13],
            wrist: landmarks[15],
            spine: landmarks[23]
        };
    }

    calculateSquatProbability(points) {
        if (!points.hip || !points.knee || !points.ankle) return 0;

        const kneeAngle = this.calculateAngle(points.hip, points.knee, points.ankle);
        let probability = 0;

        if (kneeAngle < 120 && kneeAngle > 60) {
            probability += 0.4;
            if (points.hip.y > 0.6) {
                probability += 0.3;
            }
            if (Math.abs(points.knee.x - points.ankle.x) < 0.15) {
                probability += 0.3;
            }
        }

        return probability;
    }

    calculateSideBendProbability(points) {
        if (!points.shoulder || !points.hip) return 0;

        const verticalReference = { x: points.hip.x, y: points.hip.y + 1, z: points.hip.z };
        const spineAngle = this.calculateAngle(points.shoulder, points.hip, verticalReference);
        let probability = 0;

        if (Math.abs(90 - spineAngle) > 20) {
            probability += 0.4;
            const forwardLean = Math.abs(points.shoulder.z - points.hip.z);
            if (forwardLean < 0.2) {
                probability += 0.3;
            }
            const shoulderTilt = Math.abs(points.shoulder.y - points.hip.y);
            if (shoulderTilt > 0.2) {
                probability += 0.3;
            }
        }

        return probability;
    }

    updateExerciseHistory(probabilities) {
        this.exerciseHistory.push(probabilities);
        if (this.exerciseHistory.length > this.historySize) {
            this.exerciseHistory.shift();
        }
    }

    getStableExercise() {
        if (this.exerciseHistory.length < this.minFramesForDetection) {
            return this.currentExercise || "unknown";
        }

        const recentFrames = this.exerciseHistory.slice(-this.confidenceThreshold);
        const averages = {};

        Object.keys(recentFrames[0]).forEach(exercise => {
            const sum = recentFrames.reduce((acc, frame) => acc + frame[exercise], 0);
            averages[exercise] = sum / this.confidenceThreshold;
        });

        const maxExercise = Object.entries(averages)
            .reduce((max, [exercise, prob]) => 
                prob > (max.prob || 0) ? {exercise, prob} : max, {});

        if (maxExercise.prob > this.detectionThreshold) {
            if (maxExercise.exercise !== this.currentExercise) {
                this.framesSinceLastChange++;
                if (this.framesSinceLastChange > this.confidenceThreshold) {
                    this.currentExercise = maxExercise.exercise;
                    this.framesSinceLastChange = 0;
                    this.repCount = 0;
                }
            } else {
                this.framesSinceLastChange = 0;
            }
        }

        return this.currentExercise || "unknown";
    }

    analyzeForm(exercise, points) {
        const feedback = [];
        let quality = 'good';

        switch (exercise) {
            case 'squat':
                if (Math.abs(points.knee.x - points.ankle.x) > 0.15) {
                    feedback.push("Keep knees aligned with toes");
                    quality = 'needs_correction';
                }
                break;
            case 'sideBend':
                if (Math.abs(points.shoulder.z - points.hip.z) > 0.2) {
                    feedback.push("Keep your body facing forward");
                    quality = 'needs_correction';
                }
                break;
        }

        return { quality, feedback };
    }
}

export default ExerciseDetector; 