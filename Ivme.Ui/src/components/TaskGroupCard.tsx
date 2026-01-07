import { useState } from 'react';
import { taskGroupsApi } from '../services/api';
import type { TaskGroup } from '../services/api';
import TaskList from './TaskList';

interface TaskGroupCardProps {
  group: TaskGroup;
  onUpdate: () => void;
}

export default function TaskGroupCard({ group, onUpdate }: TaskGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(group);

  const workPeriodLabels: Record<string, string> = {
    Daily: 'Günlük',
    Weekly: 'Haftalık',
    Monthly: 'Aylık',
  };

  const handleSave = async () => {
    try {
      await taskGroupsApi.update(editData);
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      alert('Güncelleme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  const handleDelete = async () => {
    if (!confirm('Bu grubu ve içindeki tüm taskları silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await taskGroupsApi.delete(group.id);
      onUpdate();
    } catch (err) {
      alert('Silme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  return (
    <div className={`task-group-card ${!group.isActive ? 'inactive' : ''}`}>
      <div className="group-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="group-info">
          <h3>{group.name}</h3>
          <span className="work-period">{workPeriodLabels[group.workPeriod]}</span>
          {!group.isActive && <span className="badge">Pasif</span>}
        </div>
        <div className="group-actions">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(!isEditing);
            }}
            className="btn-edit"
          >
            {isEditing ? 'İptal' : 'Düzenle'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(); }} className="btn-delete">
            Sil
          </button>
          <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {isEditing ? (
        <div className="edit-form" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={editData.name}
            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            placeholder="Grup Adı"
          />
          <textarea
            value={editData.description}
            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            placeholder="Açıklama"
          />
          <select
            value={editData.workPeriod}
            onChange={(e) => setEditData({ ...editData, workPeriod: e.target.value as any })}
          >
            <option value="Daily">Günlük</option>
            <option value="Weekly">Haftalık</option>
            <option value="Monthly">Aylık</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={editData.isActive}
              onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })}
            />
            Aktif
          </label>
          <button onClick={handleSave} className="btn-save">Kaydet</button>
        </div>
      ) : (
        <div className="group-description">{group.description}</div>
      )}

      {isExpanded && (
        <div className="group-tasks" onClick={(e) => e.stopPropagation()}>
          <TaskList groupId={group.id} />
        </div>
      )}
    </div>
  );
}

