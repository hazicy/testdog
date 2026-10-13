import styles from './Input.module.css';
import { classNames } from '@/components/ui/classNames';

export function inputStyles(className = '') {
  return classNames(styles.input, className);
}
