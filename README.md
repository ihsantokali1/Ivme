# İvme (Ivme) İş Akışı (Flow) ve Görev Yönetim Sistemi

İvme, arka planda karmaşık veri işleme süreçlerini (Stored Procedure gibi), sıralı veya birbirine bağımlı görevler halinde tasarlamanızı, izlemenizi ve zamanlamanızı sağlayan gelişmiş bir dinamik iş akışı (workflow) yönetim sistemidir.

Proje, **.NET 9 Minimal/Web API** arka yüzü (backend) ve **React + Vite + TailwindCSS** mimarisi kullanılarak geliştirilmiş bir modern yönetim paneli (frontend) barındırmaktadır.

---

## 🚀 Business Özellikleri ve Yetenekler

### 1. Dinamik İş Akışları (Flow Management)
- **Akış Tasarımı (FlowItem):** Sistem üzerinden karmaşık iş akışları oluşturulabilir.
- **Gruplama ve Bağımlılık (FlowGroupAssignments):** Görevler "Grup" adı verilen çalışma grupları altında toplanır. Bir akış içinde çalışan grupların birbirlerini beklemesi (ön koşul / prerequisite) sağlanabilir. Örneğin; "Verileri Hazırlama" grubu bitmeden, "Verileri Hesaplama" grubunun çalışmaması şeklinde kurallar oluşturulabilir.
- **Görsel Tasarım (ReactFlow):** Geliştirilmiş UI arayüzü sayesinde oluşturulan iş akışları ve bağımlılık haritaları görsel olarak listelenebilir.

### 2. Akıllı Görev ve SP Keşif Sistemi (Task & SP Discovery)
- **Görev Yönetimi (TaskItems):** Akış içerisinde koşan temel eylem birimleridir.
- **Stored Procedure Discovery:** Sistem, yapılandırılmış MSSQL veritabanı kurulumlarına (Discovery Database) bağlanarak, mevcut sistemdeki *Stored Procedure*'leri (ve bunların ihtiyaç duyduğu parametreleri) otomatik tespit edip birer "Görev (Task)" olarak sisteme kazandırabilir.
- **Zengin Parametre Desteği:** Tetiklenecek görev ve procedürler için çeşitli argüman / parametre dizilimleri tanımlanabilir ve validasyonlardan geçirilebilir.

### 3. Zamanlama ve Hata Töleransı (Scheduling & Resilience)
- **Görev Zamanlayıcısı (FlowSchedules):** İş akışlarını belirlenen saatlerde veya periyotlarda otomatik olarak çalıştıracak mekanizmalar *(WorkPeriod)* tanımlanabilir.
- **Retry Mekanizması:** Görevlerde yaşanan geçici hatalar için **MaxRetryCount** (Maksimum Tekrar Deneme), **RetryDelayMinutes** (Tekrar Bekleme Süresi), **RetryIntervalMinutes** gibi dinamik özellikler yapılandırılabilir.
- **Timeout (Zaman Aşımı):** Sürecin beklenenden fazla sürme riskine karşı görevlere `TimeoutMinutes` parametresi ile sınır konarak sonsuz döngü ve kilitlenme riskleri engellenir.

### 4. Kapsamlı İzleme ve Geçmiş (Execution History)
- **Flow, Group ve Task Logları:** Çalışan her bir iş, Grup ve Akış süreçlerinin tamamı `ExecutionHistories` tablolarında mikro seviyede kayıt altına alınır *(`TaskExecutionHistory`, `GroupExecutionHistory`, `FlowExecutionHistory`)*.
- **Özel Dashboard Metrikleri:** Süreç başarısızlıkları, ilerleme durumları (Progress) ve hataların nerelerde kestiği göstergeleri ile birlikte kullanışlı Recharts grafikleri aracılığıyla UI üzerinden izlenebilir.

### 5. Yetki ve Kimlik Doğrulama (Security)
- **Gelişmiş Kimlik Teyidi:** JWT (JSON Web Token) altyapısı mevcuttur.
- **Rol Tabanlı Erişim Kontrolü (RBAC):** Dinamik *Roller* ve *Rol İzin (Permission)* entegrasyonuyla API seviyesinde güvenlik denetimleri çalışır. Sistemin yetkili olmayanlar tarafından tetiklenmesi önlenir.

---

## 🛠️ Teknoloji Yığını (Tech Stack)

**Backend (API):**
- .NET (C#)
- Entity Framework Core
- MS SQL Server & ADO.NET (Mevcut veritabanlarının analizleri ve SP Keşifleri için)
- JWT Bearer Authentication

**Frontend (UI):**
- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- ReactFlow (Nodüler akış tasarımı için)
- Recharts (Metrik görselleştirilmesi için)
- Lucide React (İkon setleri)

---

## 📅 Gelecek Planı / Proje Vizyonu
Sistemin mimarisinde atılmış adımlar doğrultusunda projenin beklenen genel yol haritası (roadmap) aşağıdaki gibidir:
1. Zamanlanan süreçlerin stabil olarak bir *Job/Scheduler Worker* üzerinden takip edilmesi ve triggerlanması.
2. İzleme Modülü Entegrasyonları (Belirli bir flow hataya uğradığında Mail/Webhook atılması vs.)
3. UI üzerinde, kullanıcıların yeni bağlantılarını girip anında *Stored Procedure* keşiflerini görselleştirebilmesi ve parametre haritalamalarını interaktif olarak sürükle-bırak yöntemleriyle tasarlayabilmesi.
4. Çoklu (Multi-database) senkronizasyon yeteneklerinin geliştirilmesi.
