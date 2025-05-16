document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const saveIntervalInput = document.getElementById('saveInterval');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const manualSaveBtn = document.getElementById('manualSaveBtn');
  const projectList = document.getElementById('projectList');
  const projectDetails = document.getElementById('projectDetails');
  const currentProjectId = document.getElementById('currentProjectId');
  const savesList = document.getElementById('savesList');
  const syncStatus = document.getElementById('syncStatus');
  
  // DOM elements for message display
  const projectsSection = document.querySelector('.projects-section');
  
  // 동기화 상태 확인
  checkSyncStatus();
  
  // Load saved settings
  chrome.storage.sync.get(['saveInterval'], function(result) {
    if (result.saveInterval) {
      saveIntervalInput.value = result.saveInterval;
    }
  });
  
  // Save settings
  saveSettingsBtn.addEventListener('click', function() {
    const interval = parseInt(saveIntervalInput.value, 10);
    if (interval >= 1 && interval <= 60) {
      chrome.runtime.sendMessage({
        action: 'updateSaveInterval',
        interval: interval
      }, function(response) {
        if (response && response.status === 'success') {
          showNotification('설정이 저장되었습니다!');
        }
      });
    } else {
      showNotification('유효한 시간 간격을 입력해주세요 (1-60분)');
    }
  });
  
  // Manual save button
  manualSaveBtn.addEventListener('click', function() {
    // 버튼 비활성화 (중복 클릭 방지)
    manualSaveBtn.disabled = true;
    manualSaveBtn.textContent = '저장 중...';
    
    // Entry 작업환경 페이지 확인
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0]) {
        showNotification('활성화된 탭을 찾을 수 없습니다.');
        resetSaveButton();
        return;
      }
      
      const currentTab = tabs[0];
      
      // Entry 작업환경 페이지인지 확인
      if (!currentTab.url || !currentTab.url.includes('playentry.org/ws')) {
        showNotification('엔트리 작품 만들기 페이지에서만 사용할 수 있습니다.');
        resetSaveButton();
        return;
      }
      
      // 컨텐츠 스크립트로 저장 요청
      try {
        chrome.tabs.sendMessage(currentTab.id, { action: 'manualSave' }, function(response) {
          if (chrome.runtime.lastError) {
            console.log("저장 오류:", chrome.runtime.lastError.message);
            showNotification('저장에 실패했습니다. 페이지를 새로고침해보세요.');
            resetSaveButton();
            return;
          }
          
          if (response && response.success) {
            showNotification('작품이 저장되었습니다!');
            console.log('저장 응답:', response);
            // 작품 기록 새로고침 (현재 작품)
            setTimeout(function() {
              if (response.projectId) {
                loadProjectDetails(response.projectId);
              } else {
                getCurrentProjectAndLoadHistory();
              }
            }, 500);
          } else {
            const errorMsg = response && response.error 
              ? `저장 실패: ${response.error}` 
              : '저장에 실패했습니다. 엔트리 작품 만들기 페이지가 준비되었는지 확인하세요.';
            showNotification(errorMsg);
          }
          
          resetSaveButton();
        });
      } catch (error) {
        console.log("예외 발생:", error);
        showNotification('저장 중 오류가 발생했습니다.');
        resetSaveButton();
      }
    });
  });
  
  // 저장 버튼 상태 초기화
  function resetSaveButton() {
    manualSaveBtn.disabled = false;
    manualSaveBtn.textContent = '지금 저장';
  }
  
  // 현재 작품 ID 가져오기 및 해당 저장 기록 표시
  function getCurrentProjectAndLoadHistory() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0] || !tabs[0].url || !tabs[0].url.includes('playentry.org/ws')) {
        showNotEntryMessage('엔트리 작품 만들기 페이지가 아닙니다.');
        return;
      }
      
      try {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getCurrentProjectId' }, function(response) {
          // 오류 발생 시에도 프로그램이 중단되지 않도록 처리
          if (chrome.runtime.lastError) {
            console.log("통신 오류:", chrome.runtime.lastError.message);
            showNotEntryMessage('통신 오류가 발생했습니다. 페이지를 새로고침해보세요.');
            return;
          }
          
          if (!response) {
            console.log("응답이 없음");
            showNotEntryMessage('통신 오류가 발생했습니다. 페이지를 새로고침해보세요.');
            return;
          }
          
          const projectId = response.projectId;
          console.log("현재 작품 ID:", projectId);
          
          if (projectId === null) {
            // ID가 null인 경우 감지할 수 없다는 메시지 표시
            showNotEntryMessage('작품 ID를 감지할 수 없습니다.');
          } else {
            // 'New'이든 기존 ID든 loadProjectDetails 함수로 처리
            loadProjectDetails(projectId);
          }
        });
      } catch (error) {
        console.log("예외 발생:", error);
        showNotEntryMessage('오류가 발생했습니다: ' + error.message);
      }
    });
  }
  
  // 엔트리 작품 페이지가 아닐 때 메시지 표시
  function showNotEntryMessage(message) {
    // 모든 섹션 숨기기
    projectDetails.classList.add('hidden');
    
    // 작품 섹션 보이기 및 메시지 표시
    projectsSection.classList.remove('hidden');
    projectList.innerHTML = `<div class="no-entry-page">${message}</div>`;
    
    // 저장 버튼 비활성화
    manualSaveBtn.disabled = true;
  }
  
  // 모든 작품 목록 표시 (더 이상 사용하지 않음)
  function showAllProjects() {
    // 직접 호출하지 않고, 대신 showNotEntryMessage 사용
    showNotEntryMessage('엔트리 작품 만들기 페이지가 아닙니다.');
  }
  
  // Function to load the list of saved projects
  function loadProjectList() {
    console.log('모든 작품 목록 로딩 중...');
    
    // 로딩 표시
    projectList.innerHTML = '<div class="loading">로딩 중...</div>';
    
    chrome.storage.sync.get(['projectIds'], function(result) {
      console.log('스토리지에서 가져온 작품 ID 목록:', result);
      const projectIds = result.projectIds || [];
      
      if (projectIds.length === 0) {
        projectList.innerHTML = '<div class="no-projects">저장된 작품이 없습니다</div>';
        return;
      }
      
      projectList.innerHTML = '';
      
      projectIds.forEach(function(projectId) {
        const projectItem = document.createElement('div');
        projectItem.className = 'project-item';
        projectItem.textContent = projectId;
        
        // 각 작품 ID에 대해 로컬 스토리지 체크
        chrome.storage.local.get([projectId], function(localData) {
          const hasLocalData = localData[projectId] && localData[projectId].length > 0;
          
          if (!hasLocalData) {
            projectItem.classList.add('sync-only');
            projectItem.title = '다른 기기에서 저장된 작품 (로컬 데이터 없음)';
          }
        });
        
        projectItem.addEventListener('click', function() {
          loadProjectDetails(projectId);
        });
        
        projectList.appendChild(projectItem);
      });
    });
  }
  
  // Function to load project details
  function loadProjectDetails(projectId) {
    if (!projectId) {
      showNotification('작품 ID가 없습니다.');
      showNotEntryMessage('작품 ID를 감지할 수 없습니다.');
      return;
    }
    
    // 'project-details' 표시, 'projects-section' 숨김
    document.querySelector('.projects-section').classList.add('hidden');
    projectDetails.classList.remove('hidden');
    
    // 'New'인 경우 다른 표시
    if (projectId === 'New') {
      currentProjectId.textContent = '새 작품';
    } else {
      currentProjectId.textContent = projectId;
    }
    
    // 로딩 표시
    savesList.innerHTML = '<div class="loading">로딩 중...</div>';
    
    chrome.storage.local.get([projectId], function(result) {
      const projectSaves = result[projectId] || [];
      
      if (projectSaves.length === 0) {
        // 'New' 작품이지만 저장 기록이 없는 경우
        if (projectId === 'New') {
          savesList.innerHTML = `
            <div class="new-project-message">
              <p>현재 작업 중인 새 작품입니다.</p>
              <p>저장하려면 상단의 '지금 저장' 버튼을 클릭하세요.</p>
            </div>
          `;
        } else {
          savesList.innerHTML = '<div class="no-saves">이 작품에 대한 저장 기록이 없습니다</div>';
        }
        return;
      }
      
      savesList.innerHTML = '';
      
      // Sort by timestamp (newest first)
      projectSaves.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      projectSaves.forEach(function(save) {
        const saveItem = document.createElement('div');
        saveItem.className = 'save-item';
        
        const timestamp = new Date(save.timestamp);
        const formattedDate = timestamp.toLocaleDateString() + ' ' + timestamp.toLocaleTimeString();
        
        saveItem.innerHTML = `
          <div class="save-timestamp">${formattedDate}</div>
          <div class="save-actions">
            <button class="load-btn">이 저장 불러오기</button>
          </div>
        `;
        
        // Load button click handler
        saveItem.querySelector('.load-btn').addEventListener('click', function() {
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (!tabs || !tabs[0]) {
              showNotification('활성화된 탭을 찾을 수 없습니다.');
              return;
            }
            
            const currentTab = tabs[0];
            
            // Entry 작업환경 페이지인지 확인
            if (!currentTab.url || !currentTab.url.includes('playentry.org/ws')) {
              showNotification('엔트리 작품 만들기 페이지에서만 사용할 수 있습니다.');
              return;
            }
            
            // 컨텐츠 스크립트에 불러오기 요청
            try {
              chrome.tabs.sendMessage(currentTab.id, {
                action: 'loadProject',
                projectData: save.data
              }, function(response) {
                if (chrome.runtime.lastError) {
                  console.log("불러오기 오류:", chrome.runtime.lastError.message);
                  showNotification('불러오기에 실패했습니다. 페이지를 새로고침해보세요.');
                  return;
                }
                
                if (response && response.success) {
                  showNotification('작품을 불러왔습니다!');
                } else {
                  const errorMsg = response && response.error 
                    ? `불러오기 실패: ${response.error}` 
                    : '불러오기에 실패했습니다. 엔트리 작품 만들기 페이지인지 확인하세요.';
                  showNotification(errorMsg);
                }
              });
            } catch (error) {
              console.log("예외 발생:", error);
              showNotification('불러오기 중 오류가 발생했습니다.');
            }
          });
        });
        
        savesList.appendChild(saveItem);
      });
    });
  }
  
  // Helper function to show a notification
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.bottom = '10px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.backgroundColor = '#2ecc71';
    notification.style.color = 'white';
    notification.style.padding = '8px 16px';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '1000';
    
    document.body.appendChild(notification);
    
    setTimeout(function() {
      notification.remove();
    }, 3000);
  }
  
  // 구글 계정 동기화 상태 확인
  function checkSyncStatus() {
    chrome.storage.sync.get(null, function(data) {
      if (chrome.runtime.lastError) {
        syncStatus.textContent = '동기화 오류 발생';
        syncStatus.classList.add('sync-error');
        console.error('동기화 상태 확인 오류:', chrome.runtime.lastError);
        return;
      }
      
      // 동기화된 설정이 있는지 확인
      if (data && Object.keys(data).length > 0) {
        syncStatus.innerHTML = '<span class="sync-icon">✓</span> 동기화 활성화됨';
        syncStatus.classList.add('sync-active');
      } else {
        syncStatus.textContent = '동기화 비활성화됨';
      }
    });
  }
  
  // CSS 스타일 추가
  const style = document.createElement('style');
  style.textContent = `
    .no-entry-page {
      color: #999;
      font-style: italic;
      text-align: center;
      padding: 20px 0;
      font-size: 14px;
    }
    
    .new-project-message {
      text-align: center;
      padding: 30px 20px;
      font-size: 14px;
      color: #555;
      line-height: 1.5;
    }
    
    .new-project-info {
      background-color: #f8f9fa;
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 10px;
      font-size: 13px;
      color: #666;
      border-left: 3px solid #3498db;
    }
  `;
  document.head.appendChild(style);
  
  // 페이지 로드 시 현재 작품 ID 확인하고 바로 해당 저장 기록 표시
  getCurrentProjectAndLoadHistory();
}); 