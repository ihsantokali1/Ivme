export type TaskParameter = {
  id: string;
  taskItemId: string;
  parameterName: string;
  parameterType: string;
  maxLength?: number;
  isRequired: boolean;
  isNullable?: boolean; // Nullable mı? (SQL'de NULL değer alabilir mi?)
  defaultValue?: string;
  order: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskItem = {
  id: string;
  name: string;
  description: string;
  retryIntervalMinutes: number; // Kaç dakikada bir tekrar çalışması gerektiği
  startTime?: string;
  endTime?: string;
  lastErrorTime?: string;
  retryDelayMinutes: number;
  progress: number;
  errorMessage?: string;
  sourceType?: 'Manual' | 'StoredProcedure';
  storedProcedureName?: string;
  storedProcedureSchema?: string;
  lastDiscoveredAt?: string;
  isActive?: boolean;
  parameters?: TaskParameter[]; // SP parametreleri
  createdAt: string;
  updatedAt: string;
};

export type TaskGroup = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type FlowItem = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type FlowGroupAssignment = {
  id: string;
  flowItemId: string;
  groupId: string;
  order: number;
  prerequisiteGroupIds: string[];
  status?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type GroupTaskAssignment = {
  id: string;
  groupId: string;
  taskItemId: string;
  order: number;
  prerequisiteTaskItemIds: string[];
  status?: 'Pending' | 'Ready' | 'Running' | 'Paused' | 'Completed' | 'MarkedAsSuccess' | 'Failed' | 'WaitingRetry';
  startTime?: string;
  endTime?: string;
  lastErrorTime?: string;
  progress?: number;
  errorMessage?: string;
  taskParameterValues?: Record<string, string | null>; // Parametre değerleri (key: parameterName, value: parameterValue veya null)
  createdAt: string;
  updatedAt: string;
};


export type GroupSchedule = {
  id: string;
  groupId: string;
  workPeriod: 'Daily' | 'Weekly' | 'Monthly';
  startTime: string; // TimeSpan formatında (örn: "09:00:00")
  restartOnError: boolean; // Hata durumunda baştan mı (true) yoksa kaldığı yerden mi (false) devam edecek
  isActive: boolean;
  lastRunTime?: string; // Son çalıştırma zamanı
  createdAt: string;
  updatedAt: string;
};

export type TaskExecutionHistory = {
  id: string;
  taskItemId: string;
  groupId?: string;
  groupExecutionId?: string;
  startTime: string;
  endTime?: string;
  duration?: string; // TimeSpan formatında
  finalStatus: 'Pending' | 'Ready' | 'Running' | 'Paused' | 'Completed' | 'Failed' | 'WaitingRetry' | 'MarkedAsSuccess';
  errorCount: number;
  errorMessage?: string;
  lastErrorTime?: string;
  retryStartTime?: string;
  retryCount?: number;
  progress: number;
  taskParameterValues?: Record<string, string | null>; // Task çalıştırılırken kullanılan parametre değerleri
  triggeredBy?: string;
  createdAt: string;
};

export type GroupExecutionHistory = {
  id: string;
  groupId: string;
  startTime: string;
  endTime?: string;
  duration?: string; // TimeSpan formatında
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalErrors: number;
  triggeredBy?: string;
  createdAt: string;
};


const API_BASE_URL = 'http://localhost:5041/api';
const TOKEN_KEY = 'ivme_auth_token';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 saniye timeout

    // Token'ı header'a ekle
    const token = localStorage.getItem(TOKEN_KEY);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    // 204 No Content için boş response'u handle et
    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      // 401 Unauthorized durumunda token'ı temizle ve login sayfasına yönlendir
      if (response.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('ivme_user');
        // Login sayfasına yönlendir
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }

      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`API error (${response.status}): ${errorText || response.statusText}`);
    }

    // Response body'yi kontrol et
    const text = await response.text();

    // Boş response ise undefined döndür
    if (!text || text.trim() === '') {
      return undefined as T;
    }

    // JSON parse et
    try {
      return JSON.parse(text);
    } catch (e) {
      // JSON değilse text olarak döndür (eğer T string ise)
      return text as T;
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('API çağrısı zaman aşımına uğradı (30 saniye)');
      }
      throw error;
    }
    throw new Error('Bilinmeyen hata oluştu');
  }
}

export const taskGroupsApi = {
  getAll: () => fetchApi<TaskGroup[]>('/taskgroups'),
  getById: (id: string) => fetchApi<TaskGroup>(`/taskgroups/${id}`),
  create: (group: Omit<TaskGroup, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<TaskGroup>('/taskgroups', {
      method: 'POST',
      body: JSON.stringify(group),
    }),
  update: (group: TaskGroup) =>
    fetchApi<TaskGroup>(`/taskgroups/${group.id}`, {
      method: 'PUT',
      body: JSON.stringify(group),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/taskgroups/${id}`, {
      method: 'DELETE',
    }),
  start: (id: string, fromTaskItemId?: string) =>
    fetchApi<{ message: string }>(`/taskgroups/${id}/start`, {
      method: 'POST',
      body: JSON.stringify(fromTaskItemId ? { fromTaskItemId } : {}),
      headers: {
        'Content-Type': 'application/json',
      },
    }),
};

export const flowItemsApi = {
  getAll: () => fetchApi<FlowItem[]>('/flow-items'),
  getById: (id: string) => fetchApi<FlowItem>(`/flow-items/${id}`),
  create: (flow: Omit<FlowItem, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<FlowItem>('/flow-items', {
      method: 'POST',
      body: JSON.stringify(flow),
    }),
  update: (flow: FlowItem) =>
    fetchApi<FlowItem>(`/flow-items/${flow.id}`, {
      method: 'PUT',
      body: JSON.stringify(flow),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/flow-items/${id}`, {
      method: 'DELETE',
    }),
};


export const flowGroupAssignmentsApi = {
  getAll: () => fetchApi<FlowGroupAssignment[]>('/flow-group-assignments'),
  getByFlowId: (flowId: string) => fetchApi<FlowGroupAssignment[]>(`/flow-group-assignments/flow/${flowId}`),
  create: (assignment: Omit<FlowGroupAssignment, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<FlowGroupAssignment>('/flow-group-assignments', {
      method: 'POST',
      body: JSON.stringify(assignment),
    }),
  update: (assignment: FlowGroupAssignment) =>
    fetchApi<void>(`/flow-group-assignments/${assignment.id}`, {
      method: 'PUT',
      body: JSON.stringify(assignment),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/flow-group-assignments/${id}`, {
      method: 'DELETE',
    }),
};

export const taskItemsApi = {
  getAll: (groupId?: string) =>
    fetchApi<TaskItem[]>(`/tasks${groupId ? `?groupId=${groupId}` : ''}`),
  getById: (id: string) => fetchApi<TaskItem>(`/tasks/${id}`),
  create: (taskItem: Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<TaskItem>('/tasks', {
      method: 'POST',
      body: JSON.stringify(taskItem),
    }),
  update: (taskItem: TaskItem) =>
    fetchApi<TaskItem>(`/tasks/${taskItem.id}`, {
      method: 'PUT',
      body: JSON.stringify(taskItem),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/tasks/${id}`, {
      method: 'DELETE',
    }),
  start: (id: string) =>
    fetchApi<{ message: string }>(`/tasks/${id}/start`, {
      method: 'POST',
    }),
  pause: (id: string) =>
    fetchApi<{ message: string }>(`/tasks/${id}/pause`, {
      method: 'POST',
    }),
  resume: (id: string) =>
    fetchApi<{ message: string }>(`/tasks/${id}/resume`, {
      method: 'POST',
    }),
  stop: (id: string) =>
    fetchApi<{ message: string }>(`/tasks/${id}/stop`, {
      method: 'POST',
    }),
  complete: (id: string) =>
    fetchApi<{ message: string }>(`/tasks/${id}/complete`, {
      method: 'POST',
    }),
  markAsSuccess: (id: string, groupExecutionId?: string, groupId?: string) => {
    console.log('[API] markAsSuccess called with:', { id, groupExecutionId, groupId });
    const params = new URLSearchParams();
    if (groupExecutionId) {
      params.append('groupExecutionId', groupExecutionId);
      console.log('[API] Added groupExecutionId to params:', groupExecutionId);
    } else {
      console.warn('[API] groupExecutionId is missing!');
    }
    if (groupId) {
      params.append('groupId', groupId);
      console.log('[API] Added groupId to params:', groupId);
    } else {
      console.warn('[API] groupId is missing!');
    }
    const queryString = params.toString();
    const url = queryString
      ? `/tasks/${id}/mark-as-success?${queryString}`
      : `/tasks/${id}/mark-as-success`;
    console.log('[API] Final URL:', url);
    return fetchApi<{ message: string }>(url, {
      method: 'POST',
    });
  },
  fail: (id: string, errorMessage: string) =>
    fetchApi<{ message: string }>(`/tasks/${id}/fail`, {
      method: 'POST',
      body: JSON.stringify({ errorMessage }),
    }),
  restart: (id: string, groupId?: string) =>
    fetchApi<{ message: string }>(`/tasks/${id}/restart${groupId ? `?groupId=${groupId}` : ''}`, {
      method: 'POST',
    }),
  updateProgress: (id: string, progress: number) =>
    fetchApi<{ message: string }>(`/tasks/${id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({ progress }),
    }),
  getReady: () => fetchApi<TaskItem[]>('/tasks/ready'),
  checkStatuses: () =>
    fetchApi<{ message: string }>('/tasks/check-statuses', {
      method: 'POST',
    }),
  assignToGroup: (taskItemId: string, groupId: string) =>
    fetchApi<{ message: string }>(`/tasks/${taskItemId}/assign/${groupId}`, {
      method: 'POST',
    }),
  unassignFromGroup: (taskItemId: string, groupId: string) =>
    fetchApi<{ message: string }>(`/tasks/${taskItemId}/unassign/${groupId}`, {
      method: 'DELETE',
    }),
  getGroups: (taskItemId: string) =>
    fetchApi<string[]>(`/tasks/${taskItemId}/groups`),
};

export const taskParametersApi = {
  getByTaskItem: (taskItemId: string) =>
    fetchApi<TaskParameter[]>(`/taskparameters?taskItemId=${taskItemId}`),
};

export const groupTaskAssignmentsApi = {
  getAll: () =>
    fetchApi<GroupTaskAssignment[]>('/grouptaskassignments'),
  getByGroup: (groupId: string) =>
    fetchApi<GroupTaskAssignment[]>(`/grouptaskassignments/group/${groupId}`),
  getById: (id: string) =>
    fetchApi<GroupTaskAssignment>(`/grouptaskassignments/${id}`),
  create: (assignment: Omit<GroupTaskAssignment, 'id' | 'createdAt' | 'updatedAt'>) =>
    fetchApi<GroupTaskAssignment>('/grouptaskassignments', {
      method: 'POST',
      body: JSON.stringify(assignment),
    }),
  update: (assignment: GroupTaskAssignment) =>
    fetchApi<GroupTaskAssignment>(`/grouptaskassignments/${assignment.id}`, {
      method: 'PUT',
      body: JSON.stringify(assignment),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/grouptaskassignments/${id}`, {
      method: 'DELETE',
    }),
};

export const groupSchedulesApi = {
  getByGroup: (groupId: string) =>
    fetchApi<GroupSchedule>(`/groupschedules/group/${groupId}`),
  createOrUpdate: (schedule: Omit<GroupSchedule, 'id' | 'createdAt' | 'updatedAt'> | GroupSchedule) =>
    fetchApi<GroupSchedule>('/groupschedules', {
      method: 'POST',
      body: JSON.stringify(schedule),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/groupschedules/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    }),
};

export type FlowSchedule = {
  id: string;
  flowItemId: string;
  workPeriod: 'Daily' | 'Weekly' | 'Monthly';
  startTime: string; // TimeSpan formatında (örn: "09:00:00")
  restartOnError: boolean;
  isActive: boolean;
  lastRunTime?: string;
  createdAt: string;
  updatedAt: string;
};

export const flowSchedulesApi = {
  getByFlow: (flowItemId: string) =>
    fetchApi<FlowSchedule>(`/flowschedules/flow/${flowItemId}`),
  createOrUpdate: (schedule: Omit<FlowSchedule, 'id' | 'createdAt' | 'updatedAt'> | FlowSchedule) =>
    fetchApi<FlowSchedule>('/flowschedules', {
      method: 'POST',
      body: JSON.stringify(schedule),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/flowschedules/${id}`, {
      method: 'DELETE',
    }),
};

export const executionHistoryApi = {
  getTaskHistories: (params?: {
    taskItemId?: string;
    groupId?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.taskItemId) queryParams.append('taskItemId', params.taskItemId);
    if (params?.groupId) queryParams.append('groupId', params.groupId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    return fetchApi<TaskExecutionHistory[]>(`/executionhistory/tasks?${queryParams.toString()}`);
  },
  getGroupHistories: (params?: {
    groupId?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.groupId) queryParams.append('groupId', params.groupId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    return fetchApi<GroupExecutionHistory[]>(`/executionhistory/groups?${queryParams.toString()}`);
  },
  getTaskHistory: (id: string) =>
    fetchApi<TaskExecutionHistory>(`/executionhistory/tasks/${id}`),
  getGroupHistory: (id: string) =>
    fetchApi<GroupExecutionHistory>(`/executionhistory/groups/${id}`),
  getTodayStatuses: () =>
    fetchApi<Record<string, string>>('/executionhistory/today-statuses'),
  getTodayStatusesWithErrors: () =>
    fetchApi<Record<string, { status: string; errorMessage?: string }>>('/executionhistory/today-statuses-with-errors'),
};

export type User = {
  id: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export const usersApi = {
  getAll: () => fetchApi<User[]>('/auth/users'),
  update: (userId: string, data: { email?: string; role?: string; isActive?: boolean }) =>
    fetchApi<User>(`/auth/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  updatePassword: (userId: string, newPassword: string) =>
    fetchApi<{ message: string }>(`/auth/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword }),
    }),
  delete: (userId: string) =>
    fetchApi<{ message: string }>(`/auth/users/${userId}`, {
      method: 'DELETE',
    }),
  register: (data: { username: string; password: string; email?: string; role?: string }) =>
    fetchApi<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export const permissionsApi = {
  getByRole: (role: string) => fetchApi<string[]>(`/permission/roles/${role}`),
  getAll: () => fetchApi<Record<string, string[]>>('/permission/roles'),
  updateRole: (role: string, permissions: string[]) =>
    fetchApi<{ message: string }>(`/permission/roles/${role}`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),
  initialize: () =>
    fetchApi<{ message: string }>('/permission/initialize', {
      method: 'POST',
    }),
};

export type Role = {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export const rolesApi = {
  getAll: () => fetchApi<Role[]>('/role'),
  getById: (id: string) => fetchApi<Role>(`/role/${id}`),
  create: (data: { name: string; description?: string; isActive?: boolean }) =>
    fetchApi<Role>('/role', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name: string; description?: string; isActive?: boolean }) =>
    fetchApi<Role>(`/role/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/role/${id}`, {
      method: 'DELETE',
    }),
};

export const flowExecutionApi = {
  start: (flowId: string, triggeredBy: string = 'Manual') =>
    fetchApi<{ message: string }>(`/flow-execution/${flowId}/start?triggeredBy=${triggeredBy}`, {
      method: 'POST',
    }),
  stop: (flowId: string) =>
    fetchApi<{ message: string }>(`/flow-execution/${flowId}/stop`, {
      method: 'POST',
    }),
  resume: (flowId: string) =>
    fetchApi<{ message: string }>(`/flow-execution/${flowId}/resume`, {
      method: 'POST',
    }),
};
