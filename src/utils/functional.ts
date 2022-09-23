'use strict';

export function onceFn<T extends (...args: unknown[]) => unknown>(
  fn: (...args: Parameters<T>) => ReturnType<T>,
): (...args: Parameters<T>) => ReturnType<T> {
  let didCall = false;
  let result: ReturnType<T>;

  return (...args: Parameters<T>): ReturnType<T> => {
    if (didCall) { return result; }
    didCall = true;
    result = fn(...args);
    return result;
  };
}



// export function onceFn<T extends (...args: unknown[]) => unknown>(
//   fn: (...args: Parameters<T>) => ReturnType<T>
// ): (...args: Parameters<T>) => ReturnType<T> {
//   let didCall = false;
//   let result: ReturnType<T>;

//   return (...args: Parameters<T>): ReturnType<T> => {
//     if (didCall) { return result; }
//     didCall = true;
//     result = fn(...args);
//     return result;
//   };
// }
// export function onceEvent<T>(event: vsc.Event<T>, filter?: (arg: T) => boolean): vsc.Event<T> {
//   const filtered_event = (listener: (evt: T) => unknown, thisArgs?: unknown, disposables?: IDisposable[]): IDisposable => {
//     let didFire = false; // incase the event fires during the listener call
//     const result = event(evt => {
//       if (didFire) { return; }
//       else if (filter ? filter(evt) : true) {
//         didFire = true;
//         result.dispose();
//         return listener.call(thisArgs, evt);
//       }
//     }, null, disposables);

//     return result;
//   };
//   return filtered_event;
// }
