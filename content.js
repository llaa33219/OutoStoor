// 확장 프로그램 활성화 상태
let isExtensionActive = false;
let isEntryWorkspace = false;
let mutationObserver = null;
let checkReadyTimer = null;
let injectedScript = null;
let isInjected = false;
let currentProjectId = null;

// 주입 스크립트 준비
function injectScript() {
  if (isInjected) return;
  
  try {
    // 스크립트 요소 생성
    const scriptURL = chrome.runtime.getURL('injected.js');
    injectedScript = document.createElement('script');
    injectedScript.src = scriptURL;
    
    // 문서에 스크립트 추가
    (document.head || document.documentElement).appendChild(injectedScript);
    
    console.log('Entry 통신 스크립트 주입됨');
    isInjected = true;
    
    // 스크립트 로드 완료 알림 수신 대기
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'ENTRY_INJECTED_READY') {
        console.log('Entry 통신 스크립트 초기화 완료');
      }
    });
  } catch (e) {
    console.error('스크립트 주입 오류:', e);
  }
}

// Entry 명령 실행 함수
function executeEntryCommand(command) {
  return new Promise((resolve, reject) => {
    if (!isEntryWorkspace || !isInjected) {
      reject('Entry 작업 환경이 준비되지 않았습니다.');
      return;
    }
    
    // 실행 ID 생성
    const execId = 'exec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // 결과 리스너 설정
    const resultListener = function(event) {
      if (event.data && event.data.type === 'ENTRY_COMMAND_RESULT' && event.data.id === execId) {
        window.removeEventListener('message', resultListener);
        
        if (event.data.result.success) {
          resolve(event.data.result.result);
        } else {
          reject(event.data.result.error);
        }
      }
    };
    
    window.addEventListener('message', resultListener);
    
    // 명령 전송
    window.postMessage({
      type: 'ENTRY_EXECUTE_COMMAND',
      id: execId,
      command: command
    }, '*');
    
    // 타임아웃 설정 (5초)
    setTimeout(() => {
      window.removeEventListener('message', resultListener);
      reject('명령 실행 시간 초과');
    }, 5000);
  });
}

// Entry 작업 환경인지 확인
function checkIfEntryWorkspace() {
  isEntryWorkspace = window.location.href.includes('playentry.org/ws');
  
  if (isEntryWorkspace) {
    console.log('Entry Workspace 감지됨: 자동저장 준비 중...');
    
    // 스크립트 주입
    injectScript();
    
    // 페이지가 준비되면 활성화 조건 확인 시작
    checkWorkspaceReady();
  } else {
    isExtensionActive = false;
    stopAutoSaveFeature();
  }
}

// 작업 환경 준비 상태 확인 함수
function checkWorkspaceReady() {
  if (checkReadyTimer) {
    clearTimeout(checkReadyTimer);
  }
  
  // 이전 옵저버 제거
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  
  // 페이지 변화 감지를 위한 옵저버 설정
  let lastMutationTime = Date.now();
  mutationObserver = new MutationObserver(() => {
    lastMutationTime = Date.now();
  });
  
  // body와 head 변화 감지
  mutationObserver.observe(document.body, { 
    childList: true, 
    subtree: true, 
    attributes: true 
  });
  
  if (document.head) {
    mutationObserver.observe(document.head, { 
      childList: true, 
      subtree: true, 
      attributes: true 
    });
  }
  
  // 주기적으로 활성화 조건 확인
  checkReadyTimer = setInterval(() => {
    // 조건 1: 0.3초 동안 페이지 변화가 없는지 확인
    const noChangesDetected = (Date.now() - lastMutationTime) > 300;
    
    // 조건 2: 특정 입력 필드에 값이 있는지 확인
    const inputElement = document.querySelector('input.css-3wzhiw.e1k348jz2');
    const inputHasValue = inputElement && inputElement.value && inputElement.value.trim() !== '';
    
    // 조건 3: Entry 요소가 존재하는지 확인
    const entryExists = document.querySelector('.entryScene') !== null;
    
    // 주입된 스크립트가 준비되었는지
    const scriptReady = isInjected;
    
    if ((noChangesDetected || inputHasValue) && entryExists && scriptReady) {
      // Entry 객체 존재 여부 확인
      executeEntryCommand('Entry !== undefined').then(hasEntry => {
        if (hasEntry) {
          console.log('Entry 객체 감지됨: 자동저장 활성화');
          isExtensionActive = true;
          
          // 타이머 정리
          clearInterval(checkReadyTimer);
          checkReadyTimer = null;
          
          // 옵저버 정리
          if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
          }
          
          // 자동 저장 기능 시작
          startAutoSaveFeature();
        }
      }).catch(err => {
        console.log('Entry 객체 확인 실패:', err);
      });
    }
  }, 500);
}

// 현재 작품 ID 가져오기
async function getCurrentProjectId() {
  if (!isExtensionActive || !isEntryWorkspace) {
    console.log('활성화되지 않은 상태에서 작품 ID 요청됨');
    return null;
  }
  
  try {
    const projectId = await executeEntryCommand('Entry.projectId');
    // undefined 값이거나 빈 값인 경우 'New' 반환
    return (projectId === undefined || projectId === '') ? 'New' : projectId;
  } catch (error) {
    console.error('작품 ID 가져오기 오류:', error);
    return null;
  }
}

// 자동 저장 기능 시작
function startAutoSaveFeature() {
  if (!isEntryWorkspace) return;
  
  // Entry 작품 ID 확인
  executeEntryCommand('Entry.projectId').then(projectId => {
    // 현재 작품 ID 저장
    currentProjectId = (projectId === undefined || projectId === '') ? 'New' : projectId;
    console.log('현재 작품 ID:', currentProjectId);
    
    // 백그라운드 스크립트에 활성화 상태 전달
    chrome.runtime.sendMessage({ 
      action: 'extensionActive', 
      isActive: true,
      projectId: currentProjectId
    });
  }).catch(error => {
    console.error('작품 ID 확인 실패:', error);
  });
  
  isExtensionActive = true;
}

// 자동 저장 기능 중지
function stopAutoSaveFeature() {
  isExtensionActive = false;
  
  // 현재 작품 ID 초기화
  currentProjectId = null;
  
  // 타이머 정리
  if (checkReadyTimer) {
    clearInterval(checkReadyTimer);
    checkReadyTimer = null;
  }
  
  // 옵저버 정리
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  
  // 백그라운드 스크립트에 비활성화 상태 전달
  chrome.runtime.sendMessage({ action: 'extensionActive', isActive: false });
}

// 페이지에 알림 표시
function showPageNotification(message) {
  // 이미 존재하는 알림 제거
  const existingNotification = document.getElementById('entry-autosave-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // 새 알림 생성
  const notification = document.createElement('div');
  notification.id = 'entry-autosave-notification';
  notification.style.position = 'fixed';
  notification.style.top = '10px';
  notification.style.right = '10px';
  notification.style.backgroundColor = 'rgba(46, 204, 113, 0.9)';
  notification.style.color = 'white';
  notification.style.padding = '10px 15px';
  notification.style.borderRadius = '4px';
  notification.style.zIndex = '10000';
  notification.style.maxWidth = '300px';
  notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  notification.style.fontSize = '14px';
  notification.style.transition = 'opacity 0.3s ease-in-out';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // 3초 후 알림 제거
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// 수동 저장 실행
function manualSave() {
  if (!isExtensionActive || !isEntryWorkspace) {
    showPageNotification('자동 저장 기능이 활성화되지 않았습니다.');
    return Promise.reject('확장 프로그램이 비활성화 상태입니다.');
  }
  
  return new Promise(async (resolve, reject) => {
    try {
      // 작품 ID 가져오기
      const projectId = await executeEntryCommand('Entry.projectId');
      // undefined 값이거나 빈 값인 경우 'New' 사용
      const finalId = (projectId === undefined || projectId === '') ? 'New' : projectId;
      
      // 현재 작품 ID 업데이트
      currentProjectId = finalId;
      
      // 작품 데이터 가져오기
      const projectData = await executeEntryCommand('Entry.exportProject()');
      
      if (!projectData) {
        reject('작품 데이터를 가져올 수 없습니다.');
        return;
      }
      
      // 데이터를 백그라운드로 전송하여 저장
      chrome.runtime.sendMessage({
        action: 'saveProject',
        projectId: finalId,
        projectData: projectData
      }, (response) => {
        if (response && response.success) {
          showPageNotification(`작품이 저장되었습니다. (ID: ${finalId})`);
          resolve({ success: true, projectId: finalId });
        } else {
          showPageNotification('저장 중 오류가 발생했습니다.');
          reject(response?.error || '저장 실패');
        }
      });
    } catch (error) {
      showPageNotification('저장 중 오류가 발생했습니다.');
      reject(error);
    }
  });
}

// 작품 불러오기
function loadSavedProject(projectData) {
  if (!isExtensionActive || !isEntryWorkspace) {
    showPageNotification('자동 저장 기능이 활성화되지 않았습니다.');
    return Promise.reject('확장 프로그램이 비활성화 상태입니다.');
  }
  
  return new Promise(async (resolve, reject) => {
    try {
      // 현재 작품 지우기
      await executeEntryCommand('Entry.clearProject()');
      
      // 저장된 작품 불러오기
      await executeEntryCommand(`Entry.loadProject(${JSON.stringify(projectData)})`);
      
      // 작품 ID 다시 확인
      getCurrentProjectId().then(newId => {
        currentProjectId = newId;
      });
      
      showPageNotification('저장된 작품을 불러왔습니다.');
      resolve({ success: true });
    } catch (error) {
      showPageNotification('작품 불러오기 중 오류가 발생했습니다.');
      reject(error);
    }
  });
}

// Listen for messages from the background script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkStatus') {
    // 확장 프로그램 상태 확인 메시지 처리
    sendResponse({
      ready: isExtensionActive && isEntryWorkspace,
      isEntryWorkspace: isEntryWorkspace,
      isExtensionActive: isExtensionActive
    });
    return true;
  }
  
  if (request.action === 'getCurrentProjectId') {
    // 현재 작품 ID 반환
    if (currentProjectId) {
      // 이미 저장된 ID가 있으면 바로 반환
      sendResponse({ projectId: currentProjectId });
    } else {
      // 없으면 새로 가져오기 시도
      getCurrentProjectId().then(projectId => {
        currentProjectId = projectId;
        sendResponse({ projectId: projectId });
      }).catch(error => {
        console.error('작품 ID 가져오기 오류:', error);
        sendResponse({ projectId: null, error: error.toString() });
      });
      return true; // 비동기 응답을 위해 true 반환
    }
    return true;
  }
  
  if (request.action === 'projectSaved') {
    // 작품 저장 완료 알림
    showPageNotification(`작품이 저장되었습니다. (ID: ${request.projectId || 'New'})`);
    return true;
  }
  
  if (request.action === 'projectLoaded') {
    // 작품 로드 완료 알림
    showPageNotification('저장된 작품을 불러왔습니다.');
    return true;
  }
  
  if (request.action === 'manualSave') {
    manualSave().then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.toString() });
    });
    return true;
  }
  
  if (request.action === 'loadProject') {
    loadSavedProject(request.projectData).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.toString() });
    });
    return true;
  }
  
  if (request.action === 'executeCommand') {
    executeEntryCommand(request.command).then(result => {
      sendResponse({ success: true, result });
    }).catch(error => {
      sendResponse({ success: false, error: error.toString() });
    });
    return true;
  }
});

// 페이지 로드 시 확인
checkIfEntryWorkspace();

// URL 변경 감지를 위한 이벤트 리스너
window.addEventListener('popstate', checkIfEntryWorkspace);
window.addEventListener('hashchange', checkIfEntryWorkspace);

// 페이지 로드 완료 후 추가 확인
window.addEventListener('load', checkIfEntryWorkspace); 