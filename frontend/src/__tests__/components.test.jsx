import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RecipeCard from '../components/RecipeCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

const sampleRecipe = {
  id: 'test-1',
  title: 'Pasta Carbonara',
  description: 'Classic Italian pasta dish',
  ingredients: ['200g pasta', '100g pancetta'],
  steps: ['Boil water', 'Cook pasta'],
  image_url: '',
  servings: 2,
  prep_time: 10,
  cook_time: 20,
  tags: ['Italian', 'Pasta'],
  author_username: 'chef',
}

describe('RecipeCard', () => {
  it('renders recipe title', () => {
    render(
      <MemoryRouter>
        <RecipeCard recipe={sampleRecipe} />
      </MemoryRouter>
    )
    expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument()
  })

  it('renders recipe description', () => {
    render(
      <MemoryRouter>
        <RecipeCard recipe={sampleRecipe} />
      </MemoryRouter>
    )
    expect(screen.getByText('Classic Italian pasta dish')).toBeInTheDocument()
  })

  it('renders tags', () => {
    render(
      <MemoryRouter>
        <RecipeCard recipe={sampleRecipe} />
      </MemoryRouter>
    )
    expect(screen.getByText('Italian')).toBeInTheDocument()
    expect(screen.getByText('Pasta')).toBeInTheDocument()
  })

  it('renders total time', () => {
    render(
      <MemoryRouter>
        <RecipeCard recipe={sampleRecipe} />
      </MemoryRouter>
    )
    expect(screen.getByText('30m')).toBeInTheDocument()
  })

  it('renders servings', () => {
    render(
      <MemoryRouter>
        <RecipeCard recipe={sampleRecipe} />
      </MemoryRouter>
    )
    expect(screen.getByText('2 servings')).toBeInTheDocument()
  })

  it('shows placeholder when no image', () => {
    render(
      <MemoryRouter>
        <RecipeCard recipe={sampleRecipe} />
      </MemoryRouter>
    )
    expect(screen.getByText('🍽️')).toBeInTheDocument()
  })

  it('calls onClick handler when provided', async () => {
    const onClick = vi.fn()
    render(
      <MemoryRouter>
        <RecipeCard recipe={sampleRecipe} onClick={onClick} />
      </MemoryRouter>
    )
    screen.getByTestId('recipe-card').click()
    expect(onClick).toHaveBeenCalledWith(sampleRecipe)
  })
})

describe('LoadingSpinner', () => {
  it('renders with default label', () => {
    render(<LoadingSpinner />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders with custom label', () => {
    render(<LoadingSpinner label="Fetching recipes..." />)
    expect(screen.getByText('Fetching recipes...')).toBeInTheDocument()
  })

  it('has status role', () => {
    render(<LoadingSpinner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('renders title and message', () => {
    render(<EmptyState title="No recipes" message="Add your first recipe" />)
    expect(screen.getByText('No recipes')).toBeInTheDocument()
    expect(screen.getByText('Add your first recipe')).toBeInTheDocument()
  })

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="Empty"
        action={<button>Add Recipe</button>}
      />
    )
    expect(screen.getByText('Add Recipe')).toBeInTheDocument()
  })

  it('renders custom icon', () => {
    render(<EmptyState icon="🎉" title="Empty" />)
    expect(screen.getByText('🎉')).toBeInTheDocument()
  })
})
