/**
 * 锁机状态机模块
 *
 * 状态流转：
 *   IDLE → LOCKED → CONDITION_MET → UNLOCKED
 *                    LOCKED → SURRENDERING → UNLOCKED
 */

// 状态定义
const STATES = {
  IDLE: 'idle',                   // 空闲（未锁机）
  LOCKED: 'locked',               // 锁定中
  CONDITION_MET: 'condition_met', // 条件已满足（等待用户确认解锁）
  SURRENDERING: 'surrendering',   // 服输模式倒计时中
  UNLOCKED: 'unlocked'            // 已解锁
};

class StateMachine {
  constructor() {
    this.state = STATES.IDLE;
    this.lockStartTime = null;
    this.config = null;
    this.conditionCheckInterval = null;
    this.surrenderTimer = null;
    this.surrenderRemaining = 0;
    this.killCount = {};          // 记录各进程被杀次数
    this.blockedSiteCount = 0;
    this.listeners = [];
  }

  /**
   * 注册状态变化监听器
   */
  onChange(listener) {
    this.listeners.push(listener);
  }

  /**
   * 触发状态变化事件
   */
  _emit(eventData) {
    for (const listener of this.listeners) {
      try {
        listener({ ...eventData });
      } catch (e) {
        console.error('[StateMachine] 监听器错误:', e);
      }
    }
  }

  /**
   * 开始锁机
   */
  startLock(config) {
    if (this.state !== STATES.IDLE) {
      return { success: false, message: '当前已在锁机状态' };
    }

    this.config = config;
    this.state = STATES.LOCKED;
    this.lockStartTime = Date.now();
    this.killCount = {};
    this.blockedSiteCount = 0;
    this.surrenderRemaining = 0;

    this._emit({
      type: 'lock-state-changed',
      state: STATES.LOCKED,
      config,
      startTime: this.lockStartTime
    });

    return { success: true, message: '锁机已开始' };
  }

  /**
   * 记录进程被杀
   */
  recordKill(processName) {
    this.killCount[processName] = (this.killCount[processName] || 0) + 1;
    this._emit({
      type: 'process-killed',
      name: processName,
      count: this.killCount[processName],
      totalKills: Object.values(this.killCount).reduce((a, b) => a + b, 0)
    });
  }

  /**
   * 条件已满足
   */
  markConditionMet(result) {
    if (this.state !== STATES.LOCKED) return;

    this.state = STATES.CONDITION_MET;
    this._emit({
      type: 'lock-state-changed',
      state: STATES.CONDITION_MET,
      result,
      elapsedSeconds: Math.floor((Date.now() - this.lockStartTime) / 1000)
    });
  }

  /**
   * 解锁
   */
  unlock() {
    if (this.state !== STATES.CONDITION_MET && this.state !== STATES.SURRENDERING) {
      return { success: false, message: '当前状态不允许解锁' };
    }

    const elapsedSeconds = Math.floor((Date.now() - this.lockStartTime) / 1000);
    const totalKills = Object.values(this.killCount).reduce((a, b) => a + b, 0);

    this.state = STATES.UNLOCKED;

    if (this.surrenderTimer) {
      clearInterval(this.surrenderTimer);
      this.surrenderTimer = null;
    }

    this._emit({
      type: 'lock-state-changed',
      state: STATES.UNLOCKED,
      elapsedSeconds,
      totalKills,
      killCount: { ...this.killCount },
      wasSurrender: this.surrenderRemaining > 0
    });

    return {
      success: true,
      elapsedSeconds,
      totalKills,
      killCount: this.killCount
    };
  }

  /**
   * 服输模式
   */
  startSurrender(hours = 2) {
    if (this.state !== STATES.LOCKED) {
      return { success: false, message: '当前状态不允许服输' };
    }

    this.state = STATES.SURRENDERING;
    this.surrenderRemaining = hours * 3600; // 秒

    this._emit({
      type: 'lock-state-changed',
      state: STATES.SURRENDERING,
      remainingSeconds: this.surrenderRemaining
    });

    // 启动倒计时
    this.surrenderTimer = setInterval(() => {
      this.surrenderRemaining--;
      this._emit({
        type: 'surrender-countdown',
        remainingSeconds: this.surrenderRemaining
      });

      if (this.surrenderRemaining <= 0) {
        clearInterval(this.surrenderTimer);
        this.surrenderTimer = null;
        this.unlock();
      }
    }, 1000);

    return { success: true, remainingSeconds: this.surrenderRemaining };
  }

  /**
   * 重置到空闲状态（用于异常恢复）
   */
  reset() {
    this.state = STATES.IDLE;
    if (this.conditionCheckInterval) {
      clearInterval(this.conditionCheckInterval);
      this.conditionCheckInterval = null;
    }
    if (this.surrenderTimer) {
      clearInterval(this.surrenderTimer);
      this.surrenderTimer = null;
    }
    this.lockStartTime = null;
    this.config = null;
    this.killCount = {};
    this.surrenderRemaining = 0;

    this._emit({
      type: 'lock-state-changed',
      state: STATES.IDLE
    });
  }

  /**
   * 获取当前状态摘要
   */
  getState() {
    return {
      state: this.state,
      ...(this.lockStartTime ? {
        elapsedSeconds: Math.floor((Date.now() - this.lockStartTime) / 1000),
        startTime: this.lockStartTime
      } : {}),
      ...(this.state === STATES.SURRENDERING ? {
        surrenderRemaining: this.surrenderRemaining
      } : {}),
      killCount: { ...this.killCount },
      totalKills: Object.values(this.killCount).reduce((a, b) => a + b, 0),
      config: this.config
    };
  }

  /**
   * 判断是否可以关闭窗口
   */
  canClose() {
    return this.state === STATES.IDLE || this.state === STATES.UNLOCKED;
  }
}

module.exports = { StateMachine, STATES };
