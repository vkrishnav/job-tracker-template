import { useState } from 'react'
import { CheckCircle, Circle, Plus, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'

export default function LearningTab({ skills, setSkills }) {
  const [collapsed, setCollapsed] = useState({})

  function toggleSection(id) {
    setCollapsed(c => ({ ...c, [id]: !c[id] }))
  }

  function toggleSkill(sectionId, skillId) {
    setSkills(prev =>
      prev.map(section =>
        section.id !== sectionId ? section : {
          ...section,
          skills: section.skills.map(sk =>
            sk.id !== skillId ? sk : { ...sk, done: !sk.done }
          ),
        }
      )
    )
  }

  function deleteSkill(sectionId, skillId) {
    setSkills(prev =>
      prev.map(section =>
        section.id !== sectionId ? section : {
          ...section,
          skills: section.skills.filter(sk => sk.id !== skillId),
        }
      )
    )
  }

  function addSkill(sectionId, name) {
    if (!name.trim()) return
    setSkills(prev =>
      prev.map(section =>
        section.id !== sectionId ? section : {
          ...section,
          skills: [
            ...section.skills,
            { id: `sk_${Date.now()}`, name: name.trim(), done: false, notes: '' },
          ],
        }
      )
    )
  }

  // Summary stats
  const totalDone = skills.reduce((s, sec) => s + sec.skills.filter(sk => sk.done).length, 0)
  const totalAll  = skills.reduce((s, sec) => s + sec.skills.length, 0)
  const pct       = totalAll ? Math.round((totalDone / totalAll) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-white font-semibold">Learning Checklist</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {totalDone} of {totalAll} items complete
            </p>
          </div>
          <span className="text-2xl font-bold text-white">{pct}%</span>
        </div>
        <div className="w-full bg-[#2a2a2a] rounded-full h-2">
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Skill sections */}
      {skills.map(section => {
        const sectionDone = section.skills.filter(sk => sk.done).length
        const isOpen = !collapsed[section.id]
        return (
          <SkillSection
            key={section.id}
            section={section}
            sectionDone={sectionDone}
            isOpen={isOpen}
            onToggleSection={() => toggleSection(section.id)}
            onToggleSkill={skillId => toggleSkill(section.id, skillId)}
            onDeleteSkill={skillId => deleteSkill(section.id, skillId)}
            onAddSkill={name => addSkill(section.id, name)}
          />
        )
      })}
    </div>
  )
}

function SkillSection({ section, sectionDone, isOpen, onToggleSection, onToggleSkill, onDeleteSkill, onAddSkill }) {
  const [newSkill, setNewSkill] = useState('')

  function submit(e) {
    e.preventDefault()
    onAddSkill(newSkill)
    setNewSkill('')
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
      {/* Section header */}
      <button
        onClick={onToggleSection}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#1f1f1f] transition-colors"
      >
        <div className="flex items-center gap-3">
          {isOpen ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
          <span className="text-white font-medium">{section.category}</span>
        </div>
        <span className="text-xs text-gray-500">
          {sectionDone}/{section.skills.length}
          {sectionDone === section.skills.length && section.skills.length > 0 && (
            <span className="ml-2 text-emerald-400">✓</span>
          )}
        </span>
      </button>

      {/* Skill items */}
      {isOpen && (
        <div className="border-t border-[#2a2a2a]">
          {section.skills.map(sk => (
            <div
              key={sk.id}
              className="flex items-start gap-3 px-5 py-3 border-b border-[#222] last:border-0 group hover:bg-[#1c1c1c] transition-colors"
            >
              <button
                onClick={() => onToggleSkill(sk.id)}
                className="mt-0.5 shrink-0 text-gray-500 hover:text-indigo-400 transition-colors"
              >
                {sk.done
                  ? <CheckCircle size={16} className="text-emerald-400" />
                  : <Circle size={16} />
                }
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${sk.done ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                  {sk.name}
                </p>
                {sk.notes && (
                  <p className="text-xs text-gray-600 mt-0.5">{sk.notes}</p>
                )}
              </div>
              <button
                onClick={() => onDeleteSkill(sk.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-950/40 text-gray-600 hover:text-red-400 shrink-0"
                title="Remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {/* Add skill inline */}
          <form onSubmit={submit} className="flex items-center gap-2 px-5 py-3 bg-[#161616]">
            <Plus size={13} className="text-gray-600 shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none"
              placeholder={`Add to ${section.category}…`}
              value={newSkill}
              onChange={e => setNewSkill(e.target.value)}
            />
            {newSkill && (
              <button
                type="submit"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
              >
                Add
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
