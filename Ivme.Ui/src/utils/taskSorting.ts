import type { TaskItem, GroupTaskAssignment } from '../services/api';

/**
 * Önşartlara göre task'ları sıralar (topological sort)
 * Önşartı olan task'lar önce gösterilir
 */
export function sortTasksByPrerequisites(
  tasks: TaskItem[],
  assignments: GroupTaskAssignment[]
): TaskItem[] {
  if (tasks.length === 0 || assignments.length === 0) {
    return tasks;
  }

  // Task ID'den assignment'a mapping
  const taskIdToAssignment = new Map<string, GroupTaskAssignment>();
  assignments.forEach(a => {
    taskIdToAssignment.set(a.taskItemId, a);
  });

  // Sadece bu gruptaki task'ları al
  const groupTaskIds = new Set(assignments.map(a => a.taskItemId));
  const groupTasks = tasks.filter(t => groupTaskIds.has(t.id));

  // Topological sort için dependency graph oluştur
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();

  // Initialize
  groupTasks.forEach(task => {
    inDegree.set(task.id, 0);
    graph.set(task.id, []);
  });

  // Dependencies ekle
  assignments.forEach(assignment => {
    assignment.prerequisiteTaskItemIds.forEach(prereqId => {
      if (groupTaskIds.has(prereqId)) {
        // prereqId -> assignment.taskItemId dependency
        const dependents = graph.get(prereqId) || [];
        dependents.push(assignment.taskItemId);
        graph.set(prereqId, dependents);
        
        const currentInDegree = inDegree.get(assignment.taskItemId) || 0;
        inDegree.set(assignment.taskItemId, currentInDegree + 1);
      }
    });
  });

  // Topological sort (Kahn's algorithm)
  const queue: string[] = [];
  const result: TaskItem[] = [];

  // In-degree 0 olan task'ları queue'ya ekle
  inDegree.forEach((degree, taskId) => {
    if (degree === 0) {
      queue.push(taskId);
    }
  });

  // Order'a göre queue'yu sırala (aynı in-degree'ye sahip task'lar için)
  queue.sort((a, b) => {
    const assignmentA = taskIdToAssignment.get(a);
    const assignmentB = taskIdToAssignment.get(b);
    return (assignmentA?.order || 0) - (assignmentB?.order || 0);
  });

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentTask = groupTasks.find(t => t.id === currentId);
    if (currentTask) {
      result.push(currentTask);
    }

    // Dependents'leri işle
    const dependents = graph.get(currentId) || [];
    dependents.forEach(dependentId => {
      const currentInDegree = inDegree.get(dependentId) || 0;
      inDegree.set(dependentId, currentInDegree - 1);
      
      if (currentInDegree - 1 === 0) {
        queue.push(dependentId);
        // Queue'ya eklerken order'a göre sırala
        queue.sort((a, b) => {
          const assignmentA = taskIdToAssignment.get(a);
          const assignmentB = taskIdToAssignment.get(b);
          return (assignmentA?.order || 0) - (assignmentB?.order || 0);
        });
      }
    });
  }

  // Eğer tüm task'lar sıralanmadıysa (cycle varsa), kalanları order'a göre ekle
  const sortedIds = new Set(result.map(t => t.id));
  const remaining = groupTasks.filter(t => !sortedIds.has(t.id));
  
  // Kalan task'ları order'a göre sırala
  remaining.sort((a, b) => {
    const assignmentA = taskIdToAssignment.get(a.id);
    const assignmentB = taskIdToAssignment.get(b.id);
    return (assignmentA?.order || 0) - (assignmentB?.order || 0);
  });

  return [...result, ...remaining];
}

/**
 * Tüm task'lar arasında önşartlara göre sıralama (grup bilgisi olmadan)
 * Bu fonksiyon tüm task'lar arasındaki önşart ilişkilerini bulmaya çalışır
 */
export function sortAllTasksByPrerequisites(
  tasks: TaskItem[],
  allAssignments: GroupTaskAssignment[]
): TaskItem[] {
  if (tasks.length === 0) {
    return tasks;
  }

  // Tüm task'lar arasındaki önşart ilişkilerini topla
  const taskPrerequisites = new Map<string, Set<string>>();
  
  tasks.forEach(task => {
    taskPrerequisites.set(task.id, new Set());
  });

  // Tüm assignment'lardan önşartları topla
  allAssignments.forEach(assignment => {
    assignment.prerequisiteTaskItemIds.forEach(prereqId => {
      const prereqs = taskPrerequisites.get(assignment.taskItemId);
      if (prereqs) {
        prereqs.add(prereqId);
      }
    });
  });

  // Topological sort
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();

  tasks.forEach(task => {
    inDegree.set(task.id, 0);
    graph.set(task.id, []);
  });

  taskPrerequisites.forEach((prereqs, taskId) => {
    prereqs.forEach(prereqId => {
      if (tasks.some(t => t.id === prereqId)) {
        const dependents = graph.get(prereqId) || [];
        dependents.push(taskId);
        graph.set(prereqId, dependents);
        
        const currentInDegree = inDegree.get(taskId) || 0;
        inDegree.set(taskId, currentInDegree + 1);
      }
    });
  });

  const queue: string[] = [];
  const result: TaskItem[] = [];

  inDegree.forEach((degree, taskId) => {
    if (degree === 0) {
      queue.push(taskId);
    }
  });

  // Queue'yu task name'e göre sırala (deterministic sıralama için)
  queue.sort((a, b) => {
    const taskA = tasks.find(t => t.id === a);
    const taskB = tasks.find(t => t.id === b);
    return (taskA?.name || '').localeCompare(taskB?.name || '');
  });

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentTask = tasks.find(t => t.id === currentId);
    if (currentTask) {
      result.push(currentTask);
    }

    const dependents = graph.get(currentId) || [];
    dependents.forEach(dependentId => {
      const currentInDegree = inDegree.get(dependentId) || 0;
      inDegree.set(dependentId, currentInDegree - 1);
      
      if (currentInDegree - 1 === 0) {
        queue.push(dependentId);
        queue.sort((a, b) => {
          const taskA = tasks.find(t => t.id === a);
          const taskB = tasks.find(t => t.id === b);
          return (taskA?.name || '').localeCompare(taskB?.name || '');
        });
      }
    });
  }

  // Kalan task'ları ekle
  const sortedIds = new Set(result.map(t => t.id));
  const remaining = tasks.filter(t => !sortedIds.has(t.id));
  remaining.sort((a, b) => a.name.localeCompare(b.name));

  return [...result, ...remaining];
}

/**
 * Task'ların bağımlılık seviyesini hesaplar
 * Seviye 0: Önşartı olmayan task'lar
 * Seviye 1: Seviye 0'daki task'ları önşart olarak kullanan task'lar
 * Seviye 2: Seviye 1'deki task'ları önşart olarak kullanan task'lar
 * vb.
 */
export function calculateTaskLevels(
  tasks: TaskItem[],
  assignments: GroupTaskAssignment[]
): Map<string, number> {
  const levels = new Map<string, number>();
  
  if (tasks.length === 0 || assignments.length === 0) {
    tasks.forEach(task => levels.set(task.id, 0));
    return levels;
  }

  // Task ID'den assignment'a mapping
  const taskIdToAssignment = new Map<string, GroupTaskAssignment>();
  assignments.forEach(a => {
    taskIdToAssignment.set(a.taskItemId, a);
  });

  // Sadece bu gruptaki task'ları al
  const groupTaskIds = new Set(assignments.map(a => a.taskItemId));
  const groupTasks = tasks.filter(t => groupTaskIds.has(t.id));

  // Önce tüm task'lara seviye 0 ver
  groupTasks.forEach(task => {
    levels.set(task.id, 0);
  });

  // Seviye hesaplama (BFS benzeri)
  // Sonsuz döngüyü önlemek için maksimum iterasyon sayısı
  const maxIterations = groupTasks.length;
  let iteration = 0;
  let changed = true;
  
  while (changed && iteration < maxIterations) {
    iteration++;
    changed = false;
    
    assignments.forEach(assignment => {
      const taskId = assignment.taskItemId;
      if (!groupTaskIds.has(taskId)) return;
      
      const currentLevel = levels.get(taskId) || 0;
      let maxPrerequisiteLevel = -1;
      
      // Tüm önşartların seviyesini kontrol et
      assignment.prerequisiteTaskItemIds.forEach(prereqId => {
        if (groupTaskIds.has(prereqId)) {
          const prereqLevel = levels.get(prereqId) || 0;
          maxPrerequisiteLevel = Math.max(maxPrerequisiteLevel, prereqLevel);
        }
      });
      
      // Eğer önşart varsa, seviye = max(önşart seviyeleri) + 1
      if (maxPrerequisiteLevel >= 0) {
        const newLevel = maxPrerequisiteLevel + 1;
        if (newLevel > currentLevel) {
          levels.set(taskId, newLevel);
          changed = true;
        }
      }
    });
  }

  return levels;
}

