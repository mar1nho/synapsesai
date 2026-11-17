// Job Object do Windows: fechar o job mata a árvore inteira de processos da sessão.
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
    SetInformationJobObject,
};
use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

pub struct Job(HANDLE);

// SAFETY: o handle do job só é usado para fechar; o Windows permite usá-lo de qualquer thread.
unsafe impl Send for Job {}
unsafe impl Sync for Job {}

impl Job {
    /// Cria um job com "matar ao fechar" e coloca o processo nele.
    pub fn for_process(pid: u32) -> Option<Job> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return None;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            let proc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if ok == 0 || proc.is_null() {
                if !proc.is_null() {
                    CloseHandle(proc);
                }
                CloseHandle(job);
                return None;
            }
            let assigned = AssignProcessToJobObject(job, proc);
            CloseHandle(proc);
            if assigned == 0 {
                CloseHandle(job);
                return None;
            }
            Some(Job(job))
        }
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
