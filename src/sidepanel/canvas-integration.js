// Canvas Integration - Handles all Canvas API calls for student data and assignments
import { STORAGE_KEYS, CANVAS_DOMAIN, GENERIC_AVATAR_URL } from '../constants/index.js';
import { getCachedData, setCachedData } from '../utils/canvasCache.js';

/**
 * Preload image for faster rendering
 */
function preloadImage(url) {
    if (!url) return;
    const img = new Image();
    img.src = url;
}

/**
 * Fetches Canvas details for a student (user data and courses)
 */
export async function fetchCanvasDetails(student) {
    if (!student.SyStudentId) return student;

    try {
        const cachedData = await getCachedData(student.SyStudentId);

        let userData;
        let courses;

        if (cachedData) {
            console.log(`✓ Cache hit for ${student.name || student.SyStudentId}`);
            userData = cachedData.userData;
            courses = cachedData.courses;
        } else {
            console.log(`→ Fetching fresh data for ${student.name || student.SyStudentId}`);

            const userUrl = `${CANVAS_DOMAIN}/api/v1/users/sis_user_id:${student.SyStudentId}`;
            const userResp = await fetch(userUrl, { headers: { 'Accept': 'application/json' } });

            if (!userResp.ok) {
                console.warn(`✗ Failed to fetch user data for ${student.SyStudentId}: ${userResp.status} ${userResp.statusText}`);
                return student;
            }
            userData = await userResp.json();

            const canvasUserId = userData.id;

            if (canvasUserId) {
                const coursesUrl = `${CANVAS_DOMAIN}/api/v1/users/${canvasUserId}/courses?include[]=enrollments&enrollment_state=active&per_page=100`;
                const coursesResp = await fetch(coursesUrl, { headers: { 'Accept': 'application/json' } });

                if (coursesResp.ok) {
                    courses = await coursesResp.json();
                    console.log(`✓ Cached data for ${student.name || student.SyStudentId}`);
                } else {
                    console.warn(`✗ Failed to fetch courses for ${student.SyStudentId}: ${coursesResp.status} ${coursesResp.statusText}`);
                    courses = [];
                }

                await setCachedData(student.SyStudentId, userData, courses);
            }
        }

        // Process userData
        if (userData.name) student.name = userData.name;
        if (userData.sortable_name) student.sortable_name = userData.sortable_name;

        if (userData.avatar_url && userData.avatar_url !== GENERIC_AVATAR_URL) {
            student.Photo = userData.avatar_url;
            preloadImage(userData.avatar_url);
        }

        if (userData.created_at) {
            student.created_at = userData.created_at;
            const createdDate = new Date(userData.created_at);
            const today = new Date();
            const timeDiff = today - createdDate;
            const daysDiff = timeDiff / (1000 * 3600 * 24);

            if (daysDiff < 60) {
                student.isNew = true;
            }
        }

        const canvasUserId = userData.id;

        // Process courses
        if (canvasUserId && courses && courses.length > 0) {
            const now = new Date();
            const validCourses = courses.filter(c => c.name && !c.name.toUpperCase().includes('CAPV'));

            let activeCourse = null;

            activeCourse = validCourses.find(c => {
                if (!c.start_at || !c.end_at) return false;
                const start = new Date(c.start_at);
                const end = new Date(c.end_at);
                return now >= start && now <= end;
            });

            if (!activeCourse && validCourses.length > 0) {
                validCourses.sort((a, b) => {
                    const dateA = a.start_at ? new Date(a.start_at) : new Date(0);
                    const dateB = b.start_at ? new Date(b.start_at) : new Date(0);
                    return dateB - dateA;
                });
                activeCourse = validCourses[0];
            }

            if (activeCourse) {
                student.url = `${CANVAS_DOMAIN}/courses/${activeCourse.id}/grades/${canvasUserId}`;

                if (activeCourse.enrollments && activeCourse.enrollments.length > 0) {
                    const enrollment = activeCourse.enrollments.find(e => e.type === 'StudentEnrollment') || activeCourse.enrollments[0];
                    if (enrollment && enrollment.grades && enrollment.grades.current_score) {
                        student.grade = enrollment.grades.current_score + '%';
                    }
                }
            } else {
                student.url = `${CANVAS_DOMAIN}/users/${canvasUserId}/grades`;
            }
        }

        return student;

    } catch (e) {
        console.error(`✗ Error fetching Canvas details for ${student.SyStudentId}:`, e);
        return student;
    }
}

/**
 * Process Step 2: Fetch Canvas IDs, courses, and photos for all students
 */
export async function processStep2(students, renderCallback) {
    const step2 = document.getElementById('step2');
    const timeSpan = step2.querySelector('.step-time');

    step2.className = 'queue-item active';
    step2.querySelector('i').className = 'fas fa-spinner';

    const startTime = Date.now();

    try {
        console.log(`[Step 2] Pinging Canvas API: ${CANVAS_DOMAIN}`);
        console.log(`[Step 2] Processing ${students.length} students in batches of 20`);

        const BATCH_SIZE = 20;
        const BATCH_DELAY_MS = 100;

        let processedCount = 0;
        let updatedStudents = [...students];

        const totalBatches = Math.ceil(updatedStudents.length / BATCH_SIZE);

        for (let i = 0; i < updatedStudents.length; i += BATCH_SIZE) {
            const batch = updatedStudents.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

            console.log(`[Step 2] Processing batch ${batchNumber}/${totalBatches} (students ${i + 1}-${Math.min(i + BATCH_SIZE, updatedStudents.length)})`);

            const promises = batch.map(student => fetchCanvasDetails(student));
            const results = await Promise.all(promises);

            results.forEach((updatedStudent, index) => {
                updatedStudents[i + index] = updatedStudent;
            });

            processedCount += batch.length;
            timeSpan.textContent = `${Math.round((processedCount / updatedStudents.length) * 100)}%`;

            if (i + BATCH_SIZE < updatedStudents.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }

        await chrome.storage.local.set({ [STORAGE_KEYS.MASTER_ENTRIES]: updatedStudents });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        step2.className = 'queue-item completed';
        step2.querySelector('i').className = 'fas fa-check';
        timeSpan.textContent = `${duration}s`;

        console.log(`[Step 2] ✓ Complete in ${duration}s - ${students.length} students processed`);

        if (renderCallback) {
            renderCallback(updatedStudents);
        }

        return updatedStudents;

    } catch (error) {
        console.error("[Step 2 Error]", error);
        step2.querySelector('i').className = 'fas fa-times';
        step2.style.color = '#ef4444';
        timeSpan.textContent = 'Error';
        throw error;
    }
}

/**
 * Parses a Canvas gradebook URL to extract course and student IDs
 */
function parseGradebookUrl(url) {
    try {
        const urlObj = new URL(url);
        const regex = /courses\/(\d+)\/grades\/(\d+)/;
        const match = urlObj.pathname.match(regex);
        if (match) {
            return {
                origin: urlObj.origin,
                courseId: match[1],
                studentId: match[2]
            };
        }
    } catch (e) {
        console.warn('Invalid gradebook URL:', url);
    }
    return null;
}

/**
 * Fetches paginated data from Canvas API
 */
async function fetchPaged(url, items = []) {
    const headers = {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    };

    try {
        const response = await fetch(url, { method: 'GET', credentials: 'include', headers });

        if (!response.ok) {
            if (items.length > 0) return items;
            throw new Error(`HTTP ${response.status}`);
        }

        const newItems = await response.json();
        const allItems = items.concat(newItems);

        const linkHeader = response.headers.get('Link');
        const nextUrl = getNextPageUrl(linkHeader);

        if (nextUrl) {
            return fetchPaged(nextUrl, allItems);
        }

        return allItems;
    } catch (e) {
        console.warn('Fetch error:', e);
        return items;
    }
}

/**
 * Extracts next page URL from Link header
 */
function getNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    const links = linkHeader.split(',');
    const nextLink = links.find(link => link.includes('rel="next"'));
    if (!nextLink) return null;
    const match = nextLink.match(/<([^>]+)>/);
    return match ? match[1] : null;
}

/**
 * Analyzes submissions to find missing assignments
 */
function analyzeMissingAssignments(submissions, userObject, studentName) {
    const now = new Date();
    const collectedAssignments = [];

    let currentGrade = "";
    if (userObject && userObject.enrollments) {
        const enrollment = userObject.enrollments.find(e => e.type === 'StudentEnrollment') || userObject.enrollments[0];

        if (enrollment && enrollment.grades) {
            if (enrollment.grades.current_score != null) {
                currentGrade = enrollment.grades.current_score;
            } else if (enrollment.grades.final_score != null) {
                currentGrade = enrollment.grades.final_score;
            } else if (enrollment.grades.current_grade != null) {
                currentGrade = String(enrollment.grades.current_grade).replace(/%/g, '');
            }
        }
    }

    submissions.forEach(sub => {
        const dueDate = sub.cached_due_date ? new Date(sub.cached_due_date) : null;

        if (dueDate && dueDate > now) return;

        const scoreStr = String(sub.score || sub.grade || '').toLowerCase();
        const isComplete = scoreStr === 'complete';

        if (isComplete) return;

        const isMissing = (sub.missing === true) ||
            ((sub.workflow_state === 'unsubmitted' || sub.workflow_state === 'unsubmitted (ungraded)') && (dueDate && dueDate < now)) ||
            (sub.score === 0);

        if (isMissing) {
            collectedAssignments.push({
                title: sub.assignment ? sub.assignment.name : 'Unknown Assignment',
                submissionLink: sub.preview_url || '',
                dueDate: sub.cached_due_date ? new Date(sub.cached_due_date).toLocaleDateString() : 'No Date',
                score: sub.grade || (sub.score !== null ? sub.score : '-'),
                workflow_state: sub.workflow_state
            });
        }
    });

    return {
        currentGrade: currentGrade,
        count: collectedAssignments.length,
        assignments: collectedAssignments
    };
}

/**
 * Fetches missing assignments for a single student
 */
async function fetchMissingAssignments(student) {
    if (!student.url) {
        console.log(`[Step 3] ${student.name}: No gradebook URL, skipping`);
        return { ...student, missingCount: 0, missingAssignments: [] };
    }

    const parsed = parseGradebookUrl(student.url);
    if (!parsed) {
        console.warn(`[Step 3] ${student.name}: Failed to parse gradebook URL: ${student.url}`);
        return { ...student, missingCount: 0, missingAssignments: [] };
    }

    const { origin, courseId, studentId } = parsed;

    try {
        const submissionsUrl = `${origin}/api/v1/courses/${courseId}/students/submissions?student_ids[]=${studentId}&include[]=assignment&per_page=100`;
        const submissions = await fetchPaged(submissionsUrl);

        const usersUrl = `${origin}/api/v1/courses/${courseId}/users?user_ids[]=${studentId}&include[]=enrollments&per_page=100`;
        const users = await fetchPaged(usersUrl);
        const userObject = users && users.length > 0 ? users[0] : null;

        const result = analyzeMissingAssignments(submissions, userObject, student.name);

        if (result.count > 0) {
            console.log(`[Step 3] ${student.name}: Found ${result.count} missing assignment(s), Grade: ${result.currentGrade || 'N/A'}`);
        }

        return {
            ...student,
            missingCount: result.count,
            missingAssignments: result.assignments,
            currentGrade: result.currentGrade
        };

    } catch (e) {
        console.error(`[Step 3] ${student.name}: Error fetching data:`, e);
        return { ...student, missingCount: 0, missingAssignments: [] };
    }
}

/**
 * Process Step 3: Check missing assignments and grades for all students
 */
export async function processStep3(students, renderCallback) {
    const step3 = document.getElementById('step3');
    const timeSpan = step3.querySelector('.step-time');

    step3.className = 'queue-item active';
    step3.querySelector('i').className = 'fas fa-spinner';

    const startTime = Date.now();

    try {
        console.log(`[Step 3] Checking student gradebooks for missing assignments`);
        console.log(`[Step 3] Processing ${students.length} students in batches of 20`);

        const BATCH_SIZE = 20;
        const BATCH_DELAY_MS = 100;

        let processedCount = 0;
        let updatedStudents = [...students];

        const totalBatches = Math.ceil(updatedStudents.length / BATCH_SIZE);

        for (let i = 0; i < updatedStudents.length; i += BATCH_SIZE) {
            const batch = updatedStudents.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

            console.log(`[Step 3] Processing batch ${batchNumber}/${totalBatches} (students ${i + 1}-${Math.min(i + BATCH_SIZE, updatedStudents.length)})`);

            const promises = batch.map(student => fetchMissingAssignments(student));
            const results = await Promise.all(promises);

            results.forEach((updatedStudent, index) => {
                updatedStudents[i + index] = updatedStudent;
            });

            processedCount += batch.length;
            timeSpan.textContent = `${Math.round((processedCount / updatedStudents.length) * 100)}%`;

            if (i + BATCH_SIZE < updatedStudents.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }

        await chrome.storage.local.set({ [STORAGE_KEYS.MASTER_ENTRIES]: updatedStudents });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        step3.className = 'queue-item completed';
        step3.querySelector('i').className = 'fas fa-check';
        timeSpan.textContent = `${duration}s`;

        const totalMissing = updatedStudents.reduce((sum, s) => sum + (s.missingCount || 0), 0);
        console.log(`[Step 3] ✓ Complete in ${duration}s - Found ${totalMissing} total missing assignments`);

        if (renderCallback) {
            renderCallback(updatedStudents);
        }

        return updatedStudents;

    } catch (error) {
        console.error("[Step 3 Error]", error);
        step3.querySelector('i').className = 'fas fa-times';
        step3.style.color = '#ef4444';
        timeSpan.textContent = 'Error';
        throw error;
    }
}
