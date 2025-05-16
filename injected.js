// Entry 명령 실행기
window.executeEntryCommand = function(command) {
  try {
    // 콘솔에서 직접 입력한 것처럼 명령 실행
    const result = Function(`"use strict"; return ${command}`)();
    return {
      success: true,
      result: result
    };
  } catch (error) {
    console.error('Entry 명령 실행 오류:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
};

// 안전하게 메시지 전송하는 함수
function safePostMessage(data) {
  try {
    // 클로닝 가능한 객체인지 확인하기 위해 구조화된 클론 알고리즘 사용
    const clone = structuredClone(data);
    window.postMessage(clone, '*');
  } catch (error) {
    console.error('메시지 전송 오류:', error);
    // 오류 발생 시 기본 정보만 전송
    try {
      window.postMessage({
        type: data.type,
        id: data.id,
        error: '메시지 전송 오류: ' + error.toString()
      }, '*');
    } catch (e) {
      console.error('기본 메시지 전송 오류:', e);
    }
  }
}

// 명령어 수신 리스너
window.addEventListener('message', function(event) {
  // 내부 메시지만 처리
  if (event.source !== window || !event.data || !event.data.type) return;
  
  // 명령 실행 요청 처리
  if (event.data.type === 'ENTRY_EXECUTE_COMMAND') {
    if (!window.Entry) {
      safePostMessage({
        type: 'ENTRY_COMMAND_RESULT',
        id: event.data.id,
        result: { 
          success: false, 
          error: 'Entry 객체가 존재하지 않습니다.' 
        }
      });
      return;
    }
    
    const result = window.executeEntryCommand(event.data.command);
    
    // 결과 반환
    safePostMessage({
      type: 'ENTRY_COMMAND_RESULT',
      id: event.data.id,
      result: result
    });
  }
});

// 초기화 완료 알림
safePostMessage({ type: 'ENTRY_INJECTED_READY' }); 