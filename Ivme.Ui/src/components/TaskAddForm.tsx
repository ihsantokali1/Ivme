import { useState, useEffect } from 'react';
import { taskParametersApi } from '../services/api';
import type { TaskItem, TaskParameter } from '../services/api';

interface TaskAddFormProps {
  taskItems: TaskItem[];
  onAddTask: (taskItemId: string, parameterValues?: Record<string, string>) => void;
}

export default function TaskAddForm({ taskItems, onAddTask }: TaskAddFormProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [parameters, setParameters] = useState<TaskParameter[]>([]);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [nullValues, setNullValues] = useState<Record<string, boolean>>({}); // Null checkbox durumları
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedTaskId) {
      loadParameters();
    } else {
      setParameters([]);
      setParameterValues({});
      setNullValues({});
    }
  }, [selectedTaskId]);

  const loadParameters = async () => {
    if (!selectedTaskId) return;
    
    setLoading(true);
    try {
      // Önce TaskItem'dan parametreleri kontrol et (eğer zaten yüklenmişse)
      const selectedTask = taskItems.find(t => t.id === selectedTaskId);
      if (selectedTask?.parameters && selectedTask.parameters.length > 0) {
        setParameters(selectedTask.parameters);
        
        // Varsayılan değerleri ayarla
        const defaults: Record<string, string> = {};
        const nulls: Record<string, boolean> = {};
        selectedTask.parameters.forEach(param => {
          if (param.defaultValue) {
            defaults[param.parameterName] = param.defaultValue;
          }
          nulls[param.parameterName] = false;
        });
        setParameterValues(defaults);
        setNullValues(nulls);
        setLoading(false);
        return;
      }
      
      // TaskItem'da yoksa API'den yükle
      const params = await taskParametersApi.getByTaskItem(selectedTaskId);
      console.log(`[TaskAddForm] Loaded ${params.length} parameters for task ${selectedTaskId}:`, params);
      setParameters(params);
      
      // Varsayılan değerleri ayarla
      const defaults: Record<string, string> = {};
      const nulls: Record<string, boolean> = {};
      params.forEach(param => {
        if (param.defaultValue) {
          defaults[param.parameterName] = param.defaultValue;
        }
        nulls[param.parameterName] = false;
      });
      setParameterValues(defaults);
      setNullValues(nulls);
    } catch (err) {
      console.error('Parametreler yüklenirken hata:', err);
      setParameters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskSelect = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleParameterChange = (paramName: string, value: string) => {
    setParameterValues(prev => ({
      ...prev,
      [paramName]: value
    }));
    
    // Eğer değer girildiyse null checkbox'ı kapat
    if (value && value.trim() !== '') {
      setNullValues(prev => ({
        ...prev,
        [paramName]: false
      }));
    }
  };

  const handleNullCheckboxChange = (paramName: string, isNull: boolean) => {
    setNullValues(prev => ({
      ...prev,
      [paramName]: isNull
    }));
    
    // Null seçildiyse değeri temizle
    if (isNull) {
      setParameterValues(prev => ({
        ...prev,
        [paramName]: ''
      }));
    }
  };

  // Parametre tipine göre input tipi ve validasyon belirle
  const getInputConfig = (param: TaskParameter) => {
    const type = param.parameterType.toLowerCase();
    const maxLength = param.maxLength || undefined;
    
    // Tarih tipleri - date picker kullan, özel değerler için kontrol
    if (type.includes('date') && !type.includes('time')) {
      return {
        inputType: 'date' as const,
        validate: (value: string) => {
          if (!value) return true;
          // Özel değerler (TODAY, YESTERDAY) geçerli
          if (value === 'TODAY' || value === 'YESTERDAY') {
            return true;
          }
          // SQL ifadeleri geçerli (CAST(GETDATE() AS date) gibi)
          if (typeof value === 'string' && (
            (value.includes('CAST(GETDATE()') && value.includes('AS date)')) ||
            (value.includes('DATEADD(day, -1') && value.includes('GETDATE()') && value.includes('AS date)'))
          )) {
            return true;
          }
          // Tarih formatı kontrolü (YYYY-MM-DD)
          return /^\d{4}-\d{2}-\d{2}$/.test(value);
        },
        formatValue: (value: string) => {
          // Özel değerler için input alanında yıldızlar göster
          if (value === 'TODAY' || value === 'YESTERDAY') {
            return '*****';
          }
          // SQL ifadelerini de yıldızlar olarak göster (CAST(GETDATE() AS date) gibi)
          if (typeof value === 'string' && (
            (value.includes('CAST(GETDATE()') && value.includes('AS date)')) ||
            (value.includes('DATEADD(day, -1') && value.includes('GETDATE()') && value.includes('AS date)'))
          )) {
            return '*****';
          }
          // Tarih formatını düzelt (YYYY-MM-DD)
          if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            return value.substring(0, 10);
          }
          return value;
        },
        placeholder: 'Tarih seçin veya Bugün/Dün butonunu kullanın'
      };
    }
    
    if (type.includes('datetime') || type.includes('datetime2')) {
      return {
        inputType: 'text' as const,
        validate: (value: string) => {
          if (!value) return true;
          // SQL fonksiyonu kontrolü
          if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)$/.test(value.trim())) {
            return true; // SQL fonksiyonu geçerli
          }
          // Datetime formatı kontrolü
          return !isNaN(Date.parse(value)) || /^\d{4}-\d{2}-\d{2}/.test(value);
        },
        formatValue: (value: string) => value, // Değeri olduğu gibi bırak
        placeholder: 'Örn: 2024-01-15 10:30:00 veya getdate()'
      };
    }
    
    if (type.includes('time')) {
      return {
        inputType: 'text' as const,
        validate: (value: string) => {
          if (!value) return true;
          // SQL fonksiyonu kontrolü
          if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)$/.test(value.trim())) {
            return true; // SQL fonksiyonu geçerli
          }
          // Time formatı kontrolü
          return /^([0-1][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(value) || !isNaN(Date.parse(value));
        },
        formatValue: (value: string) => value,
        placeholder: 'Örn: 10:30:00 veya getdate()'
      };
    }
    
    // Sayısal tipler
    if (type.includes('int') || type.includes('bigint') || type.includes('smallint') || type.includes('tinyint')) {
      return {
        inputType: 'number' as const,
        validate: (value: string) => {
          if (!value) return true;
          const num = parseInt(value, 10);
          return !isNaN(num) && isFinite(num);
        },
        formatValue: (value: string) => value
      };
    }
    
    if (type.includes('decimal') || type.includes('numeric') || type.includes('float') || type.includes('real') || type.includes('money')) {
      return {
        inputType: 'number' as const,
        validate: (value: string) => {
          if (!value) return true;
          const num = parseFloat(value);
          return !isNaN(num) && isFinite(num);
        },
        formatValue: (value: string) => value,
        step: '0.01'
      };
    }
    
    // Boolean tipi
    if (type === 'bit') {
      return {
        inputType: 'checkbox' as const,
        validate: (_value: string) => true,
        formatValue: (value: string) => value === 'true' || value === '1' ? 'true' : 'false'
      };
    }
    
    // UniqueIdentifier (GUID) tipi
    if (type === 'uniqueidentifier') {
      return {
        inputType: 'text' as const,
        validate: (value: string) => {
          if (!value) return true;
          // GUID formatı kontrolü (örn: 550e8400-e29b-41d4-a716-446655440000)
          const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return guidRegex.test(value.trim());
        },
        formatValue: (value: string) => value,
        placeholder: 'Örn: 550e8400-e29b-41d4-a716-446655440000'
      };
    }
    
    // Metin tipleri (varsayılan)
    return {
      inputType: 'text' as const,
      validate: (value: string) => {
        if (maxLength && value.length > maxLength) {
          return false;
        }
        return true;
      },
      formatValue: (value: string) => value,
      maxLength: maxLength
    };
  };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedTaskId) return;
        
        // Zorunlu parametreleri kontrol et - nullable ve null checkbox kontrolü ile
        const missingRequired: TaskParameter[] = [];
        parameters.forEach(param => {
            const isNull = nullValues[param.parameterName] || false;
            const paramKey = param.parameterName.startsWith('@') 
                ? param.parameterName 
                : `@${param.parameterName}`;
            const paramKeyWithoutAt = param.parameterName.startsWith('@')
                ? param.parameterName.substring(1)
                : param.parameterName;
            
            const hasValue = parameterValues[param.parameterName] || 
                           parameterValues[paramKey] ||
                           parameterValues[paramKeyWithoutAt] ||
                           param.defaultValue;
            
            // Nullable değilse ve boşsa veya null seçilmişse hata
            if (!param.isNullable) {
                if (isNull || !hasValue) {
                    missingRequired.push(param);
                }
            }
        });
        
        if (missingRequired.length > 0) {
            const missingNames = missingRequired.map(p => `${p.parameterName} (${p.parameterType})`).join(', ');
            alert(`Lütfen zorunlu parametreleri doldurun (NULL seçilemez):\n${missingNames}`);
            return;
        }
        
        // Null değerleri için özel işaretleme yap
        const valuesToSave: Record<string, string> = { ...parameterValues };
        Object.keys(nullValues).forEach(key => {
          if (nullValues[key]) {
            valuesToSave[key] = 'NULL'; // Backend'de NULL olarak işlenecek
          }
        });
        
        onAddTask(selectedTaskId, valuesToSave);
        
        // Formu sıfırla
        setSelectedTaskId('');
        setParameters([]);
        setParameterValues({});
        setNullValues({});
    };

  const selectedTask = taskItems.find(t => t.id === selectedTaskId);
  const isStoredProcedure = selectedTask?.sourceType === 'StoredProcedure';

  return (
    <div style={{ marginBottom: '1em', padding: '1em', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginBottom: '0.5em' }}>
          <strong>Task Ekle:</strong>
          <select
            value={selectedTaskId}
            onChange={(e) => handleTaskSelect(e.target.value)}
            style={{ width: '100%', padding: '0.5em', marginTop: '0.5em' }}
          >
            <option value="">Task seçin...</option>
            {taskItems.map((taskItem) => (
              <option key={taskItem.id} value={taskItem.id}>
                {taskItem.name} {taskItem.sourceType === 'StoredProcedure' ? '(SP)' : ''}
              </option>
            ))}
          </select>
        </label>

        {selectedTask && isStoredProcedure && (
          <div style={{ marginTop: '1em' }}>
            {loading ? (
              <div>Parametreler yükleniyor...</div>
            ) : parameters.length > 0 ? (
              <div>
                <strong style={{ display: 'block', marginBottom: '0.5em' }}>SP Parametreleri:</strong>
                {parameters.map((param) => {
                  const isNull = nullValues[param.parameterName] || false;
                  const paramKey = param.parameterName.startsWith('@') 
                    ? param.parameterName 
                    : `@${param.parameterName}`;
                  const currentValue = isNull ? '' : (parameterValues[param.parameterName] || parameterValues[paramKey] || param.defaultValue || '');
                  const inputConfig = getInputConfig(param);
                  const formattedValue = inputConfig.formatValue(currentValue);
                  const isValid = isNull || !currentValue || inputConfig.validate(currentValue);
                  
                  return (
                    <div key={param.id} style={{ marginBottom: '0.75em' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25em' }}>
                        <label style={{ display: 'block', flex: 1 }}>
                          <strong>{param.parameterName}</strong>
                          {param.isRequired && <span style={{ color: 'red', fontWeight: 'bold', marginLeft: '0.25em' }}> *</span>}
                          {!param.isNullable && <span style={{ color: '#dc3545', fontWeight: 'bold', marginLeft: '0.25em' }}> (Zorunlu)</span>}
                          <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '0.5em' }}>
                            ({param.parameterType})
                          </span>
                        </label>
                        {param.isNullable && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginLeft: '1em', whiteSpace: 'nowrap' }}>
                            <input
                              type="checkbox"
                              checked={isNull}
                              onChange={(e) => handleNullCheckboxChange(param.parameterName, e.target.checked)}
                              style={{ width: 'auto' }}
                            />
                            <span style={{ fontSize: '0.85em' }}>NULL</span>
                          </label>
                        )}
                        {/* Date alanları için hızlı seçim butonları */}
                        {inputConfig.inputType === 'date' && (param.parameterType.toLowerCase().includes('date') && !param.parameterType.toLowerCase().includes('time')) && (
                          <div style={{ display: 'flex', gap: '0.5em', marginLeft: '1em', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setNullValues(prev => ({ ...prev, [param.parameterName]: false }));
                                handleParameterChange(param.parameterName, 'TODAY');
                              }}
                              style={{
                                padding: '0.25em 0.5em',
                                fontSize: '0.75em',
                                backgroundColor: currentValue === 'TODAY' ? '#007bff' : '#f8f9fa',
                                color: currentValue === 'TODAY' ? 'white' : '#333',
                                border: '1px solid #ccc',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              Bugün
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNullValues(prev => ({ ...prev, [param.parameterName]: false }));
                                handleParameterChange(param.parameterName, 'YESTERDAY');
                              }}
                              style={{
                                padding: '0.25em 0.5em',
                                fontSize: '0.75em',
                                backgroundColor: currentValue === 'YESTERDAY' ? '#007bff' : '#f8f9fa',
                                color: currentValue === 'YESTERDAY' ? 'white' : '#333',
                                border: '1px solid #ccc',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              Dün
                            </button>
                          </div>
                        )}
                      </div>
                      {param.description && (
                        <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '0.25em' }}>
                          {param.description}
                        </div>
                      )}
                      {isNull ? (
                        <div style={{ 
                          padding: '0.5em', 
                          backgroundColor: '#e9ecef', 
                          border: '1px solid #ccc', 
                          borderRadius: '4px',
                          color: '#666',
                          fontStyle: 'italic'
                        }}>
                          NULL değer seçildi
                        </div>
                      ) : inputConfig.inputType === 'checkbox' ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
                          <input
                            type="checkbox"
                            checked={formattedValue === 'true' || formattedValue === '1'}
                            onChange={(e) => handleParameterChange(param.parameterName, e.target.checked ? 'true' : 'false')}
                            style={{ width: 'auto' }}
                          />
                          <span>{formattedValue === 'true' || formattedValue === '1' ? 'Evet' : 'Hayır'}</span>
                        </label>
                      ) : (
                        <>
                          <input
                            type={inputConfig.inputType}
                            value={formattedValue}
                            onChange={(e) => {
                              let value = e.target.value;
                              // Date input için: eğer önceki değer TODAY veya YESTERDAY ise ve kullanıcı bir tarih giriyorsa, özel değeri temizle
                              if (inputConfig.inputType === 'date' && (currentValue === 'TODAY' || currentValue === 'YESTERDAY')) {
                                // Kullanıcı yıldızları silip tarih girdiğinde, özel değeri temizle
                                if (value && value !== '' && value !== '*****') {
                                  handleParameterChange(param.parameterName, value);
                                }
                              } else {
                                // number input için boş değer kontrolü
                                if (inputConfig.inputType === 'number' && value === '') {
                                  value = '';
                                }
                                handleParameterChange(param.parameterName, value);
                              }
                            }}
                            onFocus={(e) => {
                              // Date input için: eğer yıldızlar görünüyorsa, focus olduğunda temizle
                              if (inputConfig.inputType === 'date' && (currentValue === 'TODAY' || currentValue === 'YESTERDAY')) {
                                e.target.setSelectionRange(0, e.target.value.length);
                              }
                            }}
                            placeholder={(inputConfig as any).placeholder || param.defaultValue || `Değer girin (${param.parameterType})`}
                            required={param.isRequired && !param.isNullable}
                            maxLength={inputConfig.maxLength}
                            step={(inputConfig as any).step}
                            disabled={isNull}
                            style={{ 
                              width: '100%', 
                              padding: '0.5em',
                              backgroundColor: isNull ? '#e9ecef' : 'white',
                              border: !isValid && currentValue ? '2px solid #dc3545' : '1px solid #ccc',
                              borderRadius: '4px',
                              cursor: isNull ? 'not-allowed' : 'text'
                            }}
                          />
                          {!isValid && currentValue && !isNull && (
                            <div style={{ fontSize: '0.75em', color: '#dc3545', marginTop: '0.25em' }}>
                              ⚠ {!param.isNullable && (!currentValue || currentValue.trim() === '') 
                                ? 'Bu alan zorunludur ve boş bırakılamaz' 
                                : `Geçersiz değer formatı${inputConfig.maxLength ? ` (Maksimum ${inputConfig.maxLength} karakter)` : ''}`}
                            </div>
                          )}
                          {!param.isNullable && (!currentValue || currentValue.trim() === '') && !isNull && (
                            <div style={{ fontSize: '0.75em', color: '#dc3545', marginTop: '0.25em' }}>
                              ⚠ Bu alan zorunludur ve boş bırakılamaz
                            </div>
                          )}
                        </>
                      )}
                      {param.defaultValue && (
                        <div style={{ fontSize: '0.75em', color: '#999', marginTop: '0.25em' }}>
                          Varsayılan: {param.defaultValue}
                        </div>
                      )}
                      {inputConfig.maxLength && inputConfig.inputType === 'text' && (
                        <div style={{ fontSize: '0.75em', color: '#666', marginTop: '0.25em' }}>
                          Maksimum uzunluk: {inputConfig.maxLength} karakter
                          {currentValue && ` (${currentValue.length}/${inputConfig.maxLength})`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '0.9em', color: '#666' }}>
                Bu SP'nin parametresi yok.
                <br />
                <small style={{ color: '#999', fontSize: '0.85em' }}>
                  Task ID: {selectedTaskId}
                  <br />
                  Not: Parametreler veritabanında kayıtlı değilse görünmez. SP senkronizasyonunu kontrol edin veya SP'yi yeniden keşfedin.
                </small>
              </div>
            )}
          </div>
        )}

        {selectedTaskId && (
          <button
            type="submit"
            className="btn-save"
            style={{ marginTop: '1em', width: '100%' }}
          >
            Task'ı Ekle
          </button>
        )}
      </form>
    </div>
  );
}

