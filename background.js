let saveInterval = 1; // Default: 1 minute
let isActiveTab = false;

// Initialize the alarm when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['saveInterval'], (result) => {
    saveInterval = result.saveInterval || 1;
    createAlarm();
  });
  
  console.log('확장 프로그램이 설치/업데이트 되었습니다.');
});

// Create the alarm for auto-saving
function createAlarm() {
  chrome.alarms.create('autoSave', {
    periodInMinutes: saveInterval
  });
  console.log(`자동 저장 주기가 ${saveInterval}분으로 설정되었습니다.`);
}

// Handle changes to save interval
chrome.storage.onChanged.addListener((changes) => {
  if (changes.saveInterval) {
    saveInterval = changes.saveInterval.newValue;
    createAlarm();
  }
});

// Execute script in Entry context
const executeCommand = async (command, callback) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('playentry.org/ws')) {
      if (callback) callback(null, 'Entry 작업 환경 페이지가 아닙니다.');
      return;
    }
    
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (cmd) => new Promise((resolve) => {
        const wait = () => {
          if (typeof Entry !== 'undefined') {
            try {
              resolve(Function(`"use strict"; ${cmd}`)());
            } catch (e) {
              resolve({ error: e.message });
            }
          } else setTimeout(wait, 100);
        };
        wait();
      }),
      args: [command],
      world: 'MAIN'
    });
    
    if (result.result?.error) {
      throw new Error(result.result.error);
    }
    
    if (callback) callback(result.result);
    return result.result;
  } catch (e) {
    console.error('스크립트 실행 오류:', e);
    if (callback) callback(null, e.message);
    return null;
  }
};

// Check if the current tab is on playentry.org/ws
function checkActiveTab(tabId, changeInfo, tab) {
  if (tab.url && tab.url.includes('playentry.org/ws')) {
    isActiveTab = true;
  } else {
    isActiveTab = false;
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener(checkActiveTab);

// When alarm triggers, perform auto-save
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoSave') {
    console.log('자동 저장 타이머 활성화');
    // 활성 탭에 자동 저장 요청
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('playentry.org/ws')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'manualSave' }, (response) => {
          console.log('자동 저장 응답:', response);
        });
      }
    });
  }
});

// Auto save project function
async function autoSaveProject() {
  try {
    // Get project ID
    const projectId = await executeCommand('Entry.projectId');
    console.log('자동 저장 - 작품 ID:', projectId);
    
    if (!projectId) {
      console.log('작품 ID를 가져올 수 없습니다.');
      return;
    }
    
    // Get project data
    const projectData = await executeCommand('Entry.exportProject()');
    
    if (!projectData) {
      console.log('작품 데이터를 가져올 수 없습니다.');
      return;
    }
    
    // Save project
    const savedId = projectId === 'undefined' ? 'New' : projectId;
    console.log('작품 저장 시작:', savedId);
    await saveProjectData(savedId, projectData);
    console.log('작품 저장 완료:', savedId);
    
    return { success: true, projectId: savedId };
  } catch (error) {
    console.error('자동 저장 오류:', error);
    return { success: false, error: error.toString() };
  }
}

// Save project data to storage
function saveProjectData(projectId, projectData) {
  return new Promise((resolve) => {
    const timestamp = new Date().toISOString();
    const saveData = {
      id: projectId,
      data: projectData,
      timestamp: timestamp
    };
    
    console.log(`저장 - ID: ${projectId}, 시간: ${timestamp}`);
    
    chrome.storage.local.get([projectId], (result) => {
      let projectSaves = result[projectId] || [];
      projectSaves.push(saveData);
      
      // Limit to last 50 saves per project
      if (projectSaves.length > 50) {
        projectSaves = projectSaves.slice(-50);
      }
      
      // Save back to storage
      const saveObj = {};
      saveObj[projectId] = projectSaves;
      
      chrome.storage.local.set(saveObj, () => {
        console.log(`작품 저장됨 - ID: ${projectId}, 저장 개수: ${projectSaves.length}`);
        
        // Update project ID list
        updateProjectIdList(projectId, () => {
          resolve({ success: true, projectId: projectId });
        });
      });
    });
  });
}

// Update the list of project IDs
function updateProjectIdList(newProjectId, callback) {
  console.log('작품 ID 목록 업데이트 시작:', newProjectId);
  
  chrome.storage.sync.get(['projectIds'], (result) => {
    let projectIds = result.projectIds || [];
    let updated = false;
    
    if (newProjectId && !projectIds.includes(newProjectId)) {
      projectIds.push(newProjectId);
      updated = true;
    }
    
    console.log('작품 ID 목록:', projectIds);
    
    if (updated) {
      chrome.storage.sync.set({ projectIds: projectIds }, () => {
        console.log('작품 ID 목록 업데이트 완료');
        if (callback) callback();
      });
    } else {
      console.log('작품 ID 목록 이미 최신 상태');
      if (callback) callback();
    }
  });
}

// 저장된 모든 ID 목록 확인
function logAllStoredData() {
  // 먼저 동기화된 데이터 확인
  chrome.storage.sync.get(null, (syncItems) => {
    console.log('동기화된 스토리지 데이터:', syncItems);
    
    // 그 다음 로컬 데이터 확인
    chrome.storage.local.get(null, (localItems) => {
      console.log('로컬 스토리지 데이터:', localItems);
    });
  });
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateSaveInterval') {
    chrome.storage.sync.set({ saveInterval: request.interval });
    sendResponse({ status: 'success' });
    return true;
  }
  
  if (request.action === 'saveProject') {
    console.log('작품 저장 요청 받음:', request.projectId);
    saveProjectData(request.projectId, request.projectData)
      .then((result) => {
        console.log('저장 완료:', result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error('저장 오류:', error);
        sendResponse({ success: false, error: error.toString() });
      });
    return true;
  }
  
  if (request.action === 'getStorageData') {
    logAllStoredData();
    // 동기화 스토리지와 로컬 스토리지 모두 가져오기
    chrome.storage.sync.get(null, (syncItems) => {
      chrome.storage.local.get(null, (localItems) => {
        sendResponse({ 
          syncData: syncItems,
          localData: localItems
        });
      });
    });
    return true;
  }
  
  return true;
});

// Load saved project
async function loadProject(projectData) {
  try {
    // Clear current project
    await executeCommand('Entry.clearProject()');
    
    // Load project
    await executeCommand(`Entry.loadProject(${JSON.stringify(projectData)})`);
    
    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('playentry.org/ws')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'projectLoaded' });
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('작품 로드 오류:', error);
    return { success: false, error: error.toString() };
  }
} 